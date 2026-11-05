import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { listRepositories, resolveRepository } from "./repository.js";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "paseo-jj-repositories-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "project");
  await mkdir(join(root, ".jj"), { recursive: true });
  return { directory, root };
}

test("discovery lists the root and sorted immediate jj children, including ignored checkouts", async (t) => {
  const { root } = await fixture(t);
  await Promise.all([
    mkdir(join(root, "zebra", ".jj"), { recursive: true }),
    mkdir(join(root, "alpha", ".jj"), { recursive: true }),
    mkdir(join(root, "packages", "deep", ".jj"), { recursive: true }),
    mkdir(join(root, "git-only", ".git"), { recursive: true }),
    mkdir(join(root, ".jj", "internal", ".jj"), { recursive: true }),
    mkdir(join(root, "file-marker"), { recursive: true }),
  ]);
  await writeFile(join(root, "file-marker", ".jj"), "not a directory");
  await writeFile(join(root, ".gitignore"), "alpha/\nzebra/\n");
  const expected = [
    { id: ".", label: "project" },
    { id: "alpha", label: "alpha" },
    { id: "zebra", label: "zebra" },
  ];
  assert.deepEqual(await listRepositories(root), expected);
  assert.deepEqual(await listRepositories(join(root, "packages")), expected);
  assert.equal(await resolveRepository(root), root);
  assert.equal(await resolveRepository(root, "alpha"), join(root, "alpha"));
});

test("selection rejects missing, deep, traversing, and symlinked repositories", async (t) => {
  const { directory, root } = await fixture(t);
  const outside = join(directory, "outside");
  await mkdir(join(outside, ".jj"), { recursive: true });
  await symlink(outside, join(root, "linked"), "dir");
  await mkdir(join(root, "linked-marker"));
  await symlink(join(outside, ".jj"), join(root, "linked-marker", ".jj"), "dir");
  assert.deepEqual(await listRepositories(root), [{ id: ".", label: "project" }]);
  for (const selection of [
    "missing",
    "",
    "..",
    "../outside",
    outside,
    "packages/deep",
    "linked",
    "linked-marker",
    ".jj",
    ".git",
  ])
    await assert.rejects(resolveRepository(root, selection), /Repository is unavailable/);
});

test("ordinary directories have no selectable repositories", async (t) => {
  const { directory } = await fixture(t);
  assert.deepEqual(await listRepositories(directory), []);
  assert.equal(await resolveRepository(directory), null);
});
