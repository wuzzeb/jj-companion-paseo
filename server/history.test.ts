import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { promisify } from "node:util";
import { readHistory } from "./history.js";

const execFileAsync = promisify(execFile);
const configDirectory = await mkdtemp(join(tmpdir(), "paseo-jj-history-config-"));
const configPath = join(configDirectory, "config.toml");
await writeFile(configPath, '[user]\nname = "History Test"\nemail = "history@example.invalid"\n');
const previousConfig = process.env.JJ_CONFIG;
process.env.JJ_CONFIG = configPath;
after(async () => {
  if (previousConfig === undefined) delete process.env.JJ_CONFIG;
  else process.env.JJ_CONFIG = previousConfig;
  await rm(configDirectory, { recursive: true, force: true });
});
async function jj(cwd: string, ...args: string[]) {
  const { stdout } = await execFileAsync("jj", ["--no-pager", "--color=never", ...args], { cwd });
  return stdout.trim();
}

async function repository(t: TestContext, colocated = true) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "paseo-jj-history-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repo = join(directory, "repo");
  await mkdir(repo);
  await jj(repo, "git", "init", colocated ? "--colocate" : "--no-colocate");
  return { repo, directory };
}

test("history includes parallel heads, bookmarks, workspace markers and JSON-safe descriptions", async (t) => {
  const { repo, directory } = await repository(t);
  const description = 'A "quoted" change\n\nSecond line with \\ and Unicode: café';
  await jj(repo, "describe", "-m", description);
  await jj(repo, "bookmark", "create", "feature");
  const base = await jj(
    repo,
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  );
  await jj(repo, "new", "-m", "left");
  await jj(repo, "workspace", "add", "--name", "other", "-r", base, join(directory, "other"));
  const result = await readHistory(repo, 200);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  const parent = result.changes.find((change) => change.commitId === base)!;
  assert.equal(parent.description.trim(), description);
  assert.deepEqual(parent.bookmarks, ["feature"]);
  assert.equal(result.changes.filter((change) => change.parents.includes(base)).length, 2);
  assert.ok(result.changes.some((change) => change.workspaces.includes("other")));
  assert.equal(result.changes.find((change) => change.isWorkingCopy)?.description.trim(), "left");
  assert.equal(result.hasMore, false);
});

test("a non-colocated repository and a working subdirectory return the same history", async (t) => {
  const { repo } = await repository(t, false);
  const subdir = join(repo, "packages", "app");
  await mkdir(subdir, { recursive: true });
  const root = await readHistory(repo, 200);
  assert.deepEqual(await readHistory(subdir, 200), root);
  assert.equal(root.status, "ready");
});

test("history limits are topological and report whether older changes exist", async (t) => {
  const { repo } = await repository(t);
  await jj(repo, "new", "-m", "one");
  await jj(repo, "new", "-m", "two");
  const result = await readHistory(repo, 2);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.changes.length, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.changes[0].parents[0], result.changes[1].commitId);
});

test("refresh leaves unsnapshotted files and the operation log unchanged", async (t) => {
  const { repo } = await repository(t);
  const before = await jj(
    repo,
    "--ignore-working-copy",
    "op",
    "log",
    "--no-graph",
    "-n",
    "1",
    "-T",
    "id",
  );
  await writeFile(join(repo, "unsnapshotted.txt"), "Do not snapshot me\n");
  const result = await readHistory(repo, 200);
  assert.equal(result.status, "ready");
  const after = await jj(
    repo,
    "--ignore-working-copy",
    "op",
    "log",
    "--no-graph",
    "-n",
    "1",
    "-T",
    "id",
  );
  assert.equal(after, before);
  assert.equal(await jj(repo, "--ignore-working-copy", "diff", "--name-only"), "");
});

test("ordinary directories and Git-only repositories have an explicit empty state", async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "paseo-no-jj-history-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.deepEqual(await readHistory(directory, 200), { status: "not_jj" });
  await execFileAsync("git", ["init", directory]);
  assert.deepEqual(await readHistory(directory, 200), { status: "not_jj" });
});

test("history selects a separate child repository and a nested jj workspace", async (t) => {
  const { repo, directory } = await repository(t);
  await jj(repo, "describe", "-m", "parent history");
  const child = join(repo, "child");
  await mkdir(child);
  await jj(child, "git", "init", "--no-colocate");
  await jj(child, "describe", "-m", "child history");
  const source = join(directory, "source");
  await mkdir(source);
  await jj(source, "git", "init", "--no-colocate");
  const nestedWorkspace = join(repo, "nested-workspace");
  await jj(source, "workspace", "add", "--name", "nested", nestedWorkspace);
  await jj(nestedWorkspace, "describe", "-m", "nested workspace history");
  for (const [selection, description] of [
    [".", "parent history"],
    ["child", "child history"],
    ["nested-workspace", "nested workspace history"],
  ]) {
    const result = await readHistory(repo, 200, selection);
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(
      result.changes.find((change) => change.isWorkingCopy)?.description.trim(),
      description,
    );
    assert.equal(result.root, selection === "." ? repo : join(repo, selection));
  }
  await rm(child, { recursive: true });
  await assert.rejects(readHistory(repo, 200, "child"), /Repository is unavailable/);
});

test("interleaved agent stacks stay together with the older current branch first, before pagination", async (t) => {
  const { repo } = await repository(t);
  await jj(repo, "describe", "-m", "main");
  await jj(repo, "bookmark", "create", "main");
  const id = () =>
    jj(repo, "--ignore-working-copy", "log", "--no-graph", "-r", "@", "-T", "commit_id");
  const main = await id();
  let left = main;
  let right = main;
  for (let depth = 1; depth <= 3; depth++) {
    await jj(repo, "new", left, "-m", `left-${depth}`);
    left = await id();
    await jj(repo, "new", right, "-m", `right-${depth}`);
    right = await id();
  }
  await jj(repo, "edit", left);
  const full = await readHistory(repo, 200);
  assert.equal(full.status, "ready");
  if (full.status !== "ready") return;
  assert.deepEqual(
    full.changes.map((change) => change.description.trim()),
    ["left-3", "left-2", "left-1", "right-3", "right-2", "right-1", "main", ""],
  );
  assert.equal(full.changes[0].isWorkingCopy, true);
  for (const limit of [2, 4, full.changes.length]) {
    const page = await readHistory(repo, limit);
    assert.equal(page.status, "ready");
    if (page.status !== "ready") return;
    assert.deepEqual(page.changes, full.changes.slice(0, limit));
    assert.equal(page.hasMore, limit < full.changes.length);
  }
});

test("merges and a non-head working copy keep children above parents without losing JSON data", async (t) => {
  const { repo } = await repository(t);
  const base = await jj(
    repo,
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  );
  const description =
    'JSON { braces }, graph | / \\ symbols, "quotes"\n\n' + "Long description ".repeat(100);
  await jj(repo, "new", base, "-m", description);
  const left = await jj(
    repo,
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  );
  await jj(repo, "new", base, "-m", "right");
  await jj(repo, "new", left, "@", "-m", "merge");
  await jj(repo, "edit", left);
  const result = await readHistory(repo, 200);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.changes[0].description.trim(), "merge");
  assert.equal(
    result.changes.find((change) => change.commitId === left)?.description.trim(),
    description.trim(),
  );
  const positions: ReadonlyMap<string, number> = new Map(
    result.changes.map((change, index) => [change.commitId, index]),
  );
  assert.equal(positions.size, result.changes.length);
  for (const [index, change] of result.changes.entries())
    for (const parent of change.parents)
      assert.ok(positions.get(parent)! > index, "every parent follows all its children");
});
