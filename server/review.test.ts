import assert from "node:assert/strict";
import { mkdtemp, mkdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { openReview, readReviewFile } from "./review.js";
import { runJj } from "./jj.js";
import { patchToView } from "./review-patch.js";
import { collapseContext } from "../client/review-context.js";
import { revisionSchema } from "../shared/bookmarks.js";

const configDirectory = await mkdtemp(join(tmpdir(), "jj-review-config-"));
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
const operation = async (root: string) =>
  (await runJj(root, ["op", "log", "--no-graph", "-n", "1", "-T", "id"])).trim();
const text = (view: ReturnType<typeof patchToView>, side: number) =>
  view.rows.flatMap((row) => row.cells[side]?.spans.map((span) => span.text) ?? []);
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "jj-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await jj(root, "git", "init", "--no-colocate");
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}\n`);
  await writeFile(join(root, "sample.txt"), lines.join(""));
  await writeFile(join(root, "deleted.txt"), "deleted\n");
  await writeFile(join(root, "rename.txt"), "same contents\n");
  await writeFile(join(root, "eof.txt"), "no newline");
  await jj(root, "describe", "-m", "base");
  await jj(root, "bookmark", "create", "main");
  await jj(root, "new", "-m", "feature");
  return { root, lines };
}

test("real jj full-context diffs align both sides, expose collapsed context, and retain a pinned comparison", async (t) => {
  const { root, lines } = await fixture(t);
  lines[14] = "changed line\n";
  await writeFile(join(root, "sample.txt"), lines.join(""));
  const review = await openReview(root);
  assert.deepEqual(
    review.files.map((file) => file.path),
    ["sample.txt"],
  );
  const { view } = await readReviewFile(root, { snapshot: review.snapshot, path: "sample.txt" });
  assert.equal(view.rows.length, 30);
  assert.equal(view.added, 1);
  assert.equal(view.removed, 1);
  assert.equal(view.rows[14].cells[0].spans[0].text, "line 15");
  assert.equal(view.rows[14].cells[1].spans[0].text, "changed line");
  assert.equal(view.rows[14].cells[1].oldLine, 15);
  const collapsed = collapseContext(view);
  assert.equal(collapsed.rows.length, 9);
  assert.equal(collapsed.rows[0].cells[0].style, "separator");
  assert.equal(
    view.rows[0].cells[0].spans[0].text,
    "line 1",
    "Show all must retain the complete source",
  );
  await writeFile(join(root, "sample.txt"), "later agent rewrite\n");
  await jj(root, "new", "-m", "agent's next change");
  const before = await operation(root);
  const pinned = await readReviewFile(root, { snapshot: review.snapshot, path: "sample.txt" });
  assert.deepEqual(pinned.view, view);
  assert.equal(
    await operation(root),
    before,
    "file browsing must not snapshot or alter the operation log",
  );
  const refreshed = await openReview(root);
  assert.notDeepEqual(refreshed.snapshot.comparison, review.snapshot.comparison);
  assert.deepEqual(
    text(
      (await readReviewFile(root, { snapshot: refreshed.snapshot, path: "sample.txt" })).view,
      1,
    ).filter(Boolean),
    ["later agent rewrite"],
  );
});

test("added, deleted, renamed, binary, EOF, and literal filenames survive the CLI boundary", async (t) => {
  const { root } = await fixture(t);
  const literal = "space ' quote [glob] $(literal).txt";
  await writeFile(join(root, literal), "+++ not a header\n@@ not a header\n");
  await unlink(join(root, "deleted.txt"));
  await rename(join(root, "rename.txt"), join(root, "renamed.txt"));
  await writeFile(join(root, "eof.txt"), "with newline\n");
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  const review = await openReview(root);
  const read = (path: string) => readReviewFile(root, { snapshot: review.snapshot, path });
  assert.deepEqual(text((await read(literal)).view, 1), ["+++ not a header", "@@ not a header"]);
  assert.deepEqual(text((await read("deleted.txt")).view, 0), ["deleted"]);
  assert.equal((await read("deleted.txt")).view.rows[0].cells[1].oldLine, "");
  const eof = (await read("eof.txt")).view.rows[0];
  assert.equal(eof.cells[0].noEofNewline, true);
  assert.equal(eof.cells[1].noEofNewline, false);
  const binary = await read("binary.bin");
  assert.match(binary.notice!, /Binary file/);
  assert.equal(binary.view.rows.length, 0);
  const renamed = review.files.find((file) => file.path === "renamed.txt")!;
  assert.equal(renamed.oldPath, "rename.txt");
  assert.equal(renamed.status, "R");
  assert.match((await read("renamed.txt")).notice!, /No textual changes/);
});

test("review files are restricted to the pinned repository and changed-file list", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "new.txt"), "new\n");
  const { snapshot } = await openReview(root);
  const elsewhere = join(root, "other");
  await mkdir(elsewhere);
  await assert.rejects(
    readReviewFile(elsewhere, { snapshot, path: "new.txt" }),
    /repository changed/,
  );
  await assert.rejects(
    readReviewFile(root, { snapshot, path: "../outside" }),
    /not in the pinned review/,
  );
  await assert.rejects(
    readReviewFile(root, { snapshot, path: "sample.txt" }),
    /not in the pinned review/,
  );
});

test("patch adapter preserves asymmetric edits and rejects missing full context", () => {
  const view = patchToView(
    "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1,1 +1,2 @@\n-old\n+new\n+extra\n\\ No newline at end of file\n",
  );
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[1].cells[0].oldLine, "");
  assert.equal(view.rows[1].cells[1].noEofNewline, true);
  assert.throws(() => patchToView("@@ -8,1 +8,1 @@\n-old\n+new\n"), /complete file context/);
  assert.throws(() => patchToView("@@ -1,2 +1,2 @@\n only one line\n"), /incomplete/);
});

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

test("endpoint and revset comparisons pin the requested revisions instead of the working copy", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "first.txt"), "first\n");
  await jj(root, "describe", "-m", "first");
  const first = await revision(root);
  await jj(root, "new", "-m", "second");
  await writeFile(join(root, "second.txt"), "second\n");
  await jj(root, "util", "snapshot");
  const second = await revision(root);
  await jj(root, "new", "-m", "later");
  await writeFile(join(root, "later.txt"), "must not appear\n");
  const endpoints = await openReview(root, {
    kind: "endpoints",
    from: first.commitId,
    to: second.commitId,
  });
  assert.deepEqual(
    endpoints.files.map((file) => file.path),
    ["second.txt"],
  );
  assert.deepEqual(endpoints.snapshot.comparison, {
    kind: "endpoints",
    from: first.commitId,
    to: second.commitId,
  });
  const single = await openReview(root, { kind: "change", revision: first.changeId });
  assert.equal(single.snapshot.label, `${first.changeId.slice(0, 12)} · first`);
  assert.deepEqual(
    single.files.map((file) => file.path),
    ["first.txt"],
  );
  await assert.rejects(
    openReview(root, { kind: "change", revision: `${first.changeId} | ${second.changeId}` }),
    /exactly one change/,
  );
  for (const target of [
    { kind: "revisions" as const, revset: `${first.changeId}::${second.changeId}` },
    { kind: "selection" as const, anchor: first, end: second },
    { kind: "selection" as const, anchor: second, end: first },
  ]) {
    const review = await openReview(root, target);
    if (target.kind === "selection") {
      assert.equal(
        review.snapshot.label,
        `2 changes · ${first.changeId.slice(0, 12)} → ${second.changeId.slice(0, 12)} (inclusive)`,
      );
    }
    assert.deepEqual(
      review.files.map((file) => file.path),
      ["first.txt", "second.txt"],
    );
    assert.deepEqual(
      text((await readReviewFile(root, { snapshot: review.snapshot, path: "first.txt" })).view, 1),
      ["first"],
    );
  }
  await assert.rejects(
    openReview(root, { kind: "endpoints", from: "all()", to: "@" }),
    /exactly one/,
  );
  await assert.rejects(openReview(root, { kind: "revisions", revset: "none()" }), /empty/);
});

test("selected changes follow unambiguous rewrites and merged-parent baselines", async (t) => {
  const { root, lines } = await fixture(t);
  lines[4] = "left side\n";
  await writeFile(join(root, "sample.txt"), lines.join(""));
  await jj(root, "describe", "-m", "left");
  const left = await revision(root);
  await jj(root, "new", "main", "-m", "right");
  const rightLines = [...lines];
  rightLines[4] = "line 5\n";
  rightLines[24] = "right side\n";
  await writeFile(join(root, "sample.txt"), rightLines.join(""));
  await jj(root, "util", "snapshot");
  const right = await revision(root);
  await assert.rejects(
    openReview(root, { kind: "selection", anchor: left, end: right }),
    /same linear stack/,
  );
  await jj(root, "new", left.commitId, right.commitId, "-m", "merge");
  const merge = await revision(root);
  lines[24] = "right side\n";
  lines[14] = "merge edit\n";
  await writeFile(join(root, "sample.txt"), lines.join(""));
  const review = await openReview(root, { kind: "selection", anchor: merge });
  assert.equal(review.snapshot.label, `${merge.changeId.slice(0, 12)} · merge`);
  const view = (await readReviewFile(root, { snapshot: review.snapshot, path: "sample.txt" })).view;
  assert.equal(view.added, 1);
  assert.equal(view.removed, 1);
  assert.equal(view.rows[4].cells[0].spans[0].text, "left side");
  assert.equal(view.rows[24].cells[0].spans[0].text, "right side");
  assert.equal(view.rows[14].cells[0].spans[0].text, "line 15");
  assert.equal(view.rows[14].cells[1].spans[0].text, "merge edit");
});

test("single-change details stay with the pinned diff, while comparisons have no change description", async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, "review.txt"), "original contents\n");
  await jj(root, "describe", "-m", "Review title\n\nDetailed explanation.\nSecond line.");
  const review = await openReview(root, { kind: "change", revision: "@" });
  const change = review.snapshot.change!;
  assert.equal(change.description, "Review title\n\nDetailed explanation.\nSecond line.\n");
  assert.equal(change.author, "Review Test");
  assert.match(change.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(change.hasConflict, false);
  assert.deepEqual(review.snapshot.comparison, { kind: "revisions", revisions: [change.commitId] });
  assert.equal(review.snapshot.label, `${change.changeId.slice(0, 12)} · Review title`);
  await writeFile(join(root, "review.txt"), "rewritten contents\n");
  await jj(root, "describe", "-m", "Rewritten title");
  assert.deepEqual(
    text((await readReviewFile(root, { snapshot: review.snapshot, path: "review.txt" })).view, 1),
    ["original contents"],
  );
  const refreshed = await openReview(root, { kind: "selection", anchor: change });
  assert.equal(refreshed.snapshot.change?.description, "Rewritten title\n");
  assert.notEqual(refreshed.snapshot.change?.commitId, change.commitId);
  assert.equal((await openReview(root)).snapshot.change, null);
  assert.equal(
    (await openReview(root, { kind: "endpoints", from: "main", to: "@" })).snapshot.change,
    null,
  );
});
