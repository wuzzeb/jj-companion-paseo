import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { revisionSchema } from "../shared/bookmarks.js";
import { runJj } from "./jj.js";
import { resolveReviewComparison } from "./review-comparison.js";
import { createReviewLauncher } from "./review.js";

const configDirectory = await mkdtemp(join(tmpdir(), "jj-review-comparison-config-"));
const config = join(configDirectory, "config.toml");
await writeFile(config, '[user]\nname = "Review Test"\nemail = "review@example.invalid"\n');
const previousConfig = process.env.JJ_CONFIG;
process.env.JJ_CONFIG = config;
after(async () => {
  if (previousConfig === undefined) delete process.env.JJ_CONFIG;
  else process.env.JJ_CONFIG = previousConfig;
  await rm(configDirectory, { recursive: true, force: true });
});
const jj = (root: string, ...args: string[]) => runJj(root, args, { readOnly: false });
const revision = async (root: string, revset = "@") =>
  revisionSchema.parse(
    JSON.parse(
      await runJj(root, [
        "log",
        "--no-graph",
        "-r",
        revset,
        "-T",
        'json({"commitId" => commit_id, "changeId" => change_id})',
      ]),
    ),
  );
const operation = async (root: string) =>
  (await runJj(root, ["op", "log", "--no-graph", "-n", "1", "-T", "id"])).trim();
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "jj-review-comparison-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await jj(root, "git", "init", "--no-colocate");
  await writeFile(join(root, "base.txt"), "base\n");
  await jj(root, "describe", "-m", "base");
  return { root, base: await revision(root) };
}
async function change(root: string, name: string, ...parents: ReadonlyArray<string>) {
  await jj(root, "new", ...parents, "-m", name);
  await writeFile(join(root, `${name}.txt`), `${name}\n`);
  await jj(root, "util", "snapshot");
  return revision(root);
}

test("single-change and inclusive range review pin the parent of the oldest change and the newest commit", async (t) => {
  const { root, base } = await fixture(t);
  const first = await change(root, "first");
  const middle = await change(root, "middle");
  const last = await change(root, "last");
  const originalOperation = await operation(root);
  const expected = `${base.commitId}..${last.commitId}`;
  for (const [anchor, end] of [
    [first, last],
    [last, first],
  ]) {
    assert.equal(await resolveReviewComparison(root, { kind: "range", anchor, end }), expected);
  }
  assert.equal(
    await resolveReviewComparison(root, { kind: "change", revision: middle }),
    `${first.commitId}..${middle.commitId}`,
  );
  assert.equal(
    await operation(root),
    originalOperation,
    "reviewing existing snapshots must not create commits or operations",
  );
  assert.match(
    await runJj(root, ["diff", "--from", base.commitId, "--to", last.commitId, "--summary"]),
    /first.txt/,
  );
});

test("selected working-copy review includes edits on disk and follows its rewritten change ID", async (t) => {
  const { root, base } = await fixture(t);
  const selected = await change(root, "selected");
  await writeFile(join(root, "selected.txt"), "unsnapshotted edit\n");
  const comparison = await resolveReviewComparison(root, { kind: "change", revision: selected });
  const current = await revision(root);
  assert.notEqual(current.commitId, selected.commitId);
  assert.equal(current.changeId, selected.changeId);
  assert.equal(comparison, `${base.commitId}..${current.commitId}`);
  assert.equal(await readFile(join(root, "selected.txt"), "utf8"), "unsnapshotted edit\n");
  await jj(root, "new", "-m", "another change");
  assert.equal(
    await resolveReviewComparison(root, { kind: "change", revision: selected }),
    comparison,
  );
});

test("ranges reject different branches and merges rather than substituting a first-parent diff", async (t) => {
  const { root, base } = await fixture(t);
  const left = await change(root, "left");
  const right = await change(root, "right", base.commitId);
  await assert.rejects(
    resolveReviewComparison(root, { kind: "range", anchor: left, end: right }),
    /same linear stack/,
  );
  const merge = await change(root, "merge", left.commitId, right.commitId);
  await assert.rejects(
    resolveReviewComparison(root, { kind: "change", revision: merge }),
    /starting at a merge/,
  );
  const after = await change(root, "after");
  await assert.rejects(
    resolveReviewComparison(root, { kind: "range", anchor: left, end: after }),
    /cross branches or merges/,
  );
  await assert.rejects(
    resolveReviewComparison(root, { kind: "range", anchor: merge, end: after }),
    /starting at a merge/,
  );
  const next = await change(root, "next");
  assert.equal(
    await resolveReviewComparison(root, { kind: "range", anchor: after, end: next }),
    `${merge.commitId}..${next.commitId}`,
  );
});

test("missing changes fail explicitly and jj's empty root can be reviewed", async (t) => {
  const { root } = await fixture(t);
  const selected = await change(root, "selected");
  await jj(root, "abandon", selected.commitId);
  await assert.rejects(
    resolveReviewComparison(root, { kind: "change", revision: selected }),
    /missing or divergent/,
  );
  const emptyRoot = await revision(root, "root()");
  assert.equal(
    await resolveReviewComparison(root, { kind: "change", revision: emptyRoot }),
    `${emptyRoot.commitId}..${emptyRoot.commitId}`,
  );
});

test("selected nested-repository review uses its own commits and shares the root's managed editor", async (t) => {
  const { root } = await fixture(t);
  const child = join(root, "child");
  await jj(root, "git", "init", "--no-colocate", child);
  await writeFile(join(child, "child.txt"), "child\n");
  await jj(child, "util", "snapshot");
  const selected = await revision(child);
  let requests: ReadonlyArray<{ readonly socket: string; readonly expression: string }> = [];
  const review = createReviewLauncher({
    socketDirectory: join(root, "sockets"),
    niriSocket: null,
    available: async () => true,
    send: async (socket, expression) => {
      requests = [...requests, { socket, expression }];
      return '{"status":"ready"}';
    },
  });
  t.after(() => review.dispose());
  const context = {
    paseo: { workspaces: { ref: () => ({ refresh: async () => ({ workspaceDirectory: root }) }) } },
  } as unknown as PluginHandlerContext;
  await review.branch({ workspaceId: "test" }, context);
  await review.selection(
    { workspaceId: "test", repository: "child", selection: { kind: "change", revision: selected } },
    context,
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].socket, requests[1].socket);
  assert.ok(requests[1].expression.includes(`${"0".repeat(40)}..${selected.commitId}`));
  assert.ok(requests[1].expression.includes(child));
});
