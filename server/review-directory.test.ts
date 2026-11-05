import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ensureReviewDirectory, reviewDirectory } from "./review-directory.js";

test(
  "review sockets use the private runtime directory and reject unsafe existing directories",
  { skip: process.platform === "win32" },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "jj-review-directory-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const previous = process.env.XDG_RUNTIME_DIR;
    try {
      process.env.XDG_RUNTIME_DIR = directory;
      assert.equal(await reviewDirectory(), join(directory, "paseo-jj-review"));
    } finally {
      if (previous === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = previous;
    }
    const sockets = join(directory, "sockets");
    await ensureReviewDirectory(sockets);
    assert.equal((await lstat(sockets)).mode & 0o777, 0o700);
    await chmod(sockets, 0o755);
    await assert.rejects(ensureReviewDirectory(sockets), /private permissions/);
    await chmod(sockets, 0o700);
    await assert.rejects(
      ensureReviewDirectory(sockets, process.getuid!() + 1),
      /owned by the current user/,
    );
    const link = join(directory, "link");
    await symlink(sockets, link, "dir");
    await assert.rejects(ensureReviewDirectory(link), /private permissions/);
    const file = join(directory, "ordinary");
    await writeFile(file, "");
    await assert.rejects(ensureReviewDirectory(file));
  },
);
