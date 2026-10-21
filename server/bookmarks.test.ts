import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { promisify } from "node:util";
import { readBookmarkState, runBookmarkAction } from "./bookmarks.js";
import { runJj } from "./jj.js";
import { createBookmarkOperations } from "./bookmark-operations.js";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { setTimeout as delay } from "node:timers/promises";
import type { BookmarkAction, BookmarkState } from "../shared/bookmarks.js";

const execFileAsync = promisify(execFile);
const configDirectory = await mkdtemp(join(tmpdir(), "paseo-jj-bookmark-config-"));
const configPath = join(configDirectory, "config.toml");
await writeFile(
  configPath,
  '[user]\nname = "Bookmark Test"\nemail = "bookmarks@example.invalid"\n',
);
const previousConfig = process.env.JJ_CONFIG;
process.env.JJ_CONFIG = configPath;
after(async () => {
  if (previousConfig === undefined) delete process.env.JJ_CONFIG;
  else process.env.JJ_CONFIG = previousConfig;
  await rm(configDirectory, { recursive: true, force: true });
});
const jj = (root: string, ...args: string[]) => runJj(root, args, { readOnly: false });
const workspace = (state: BookmarkState) => ({
  kind: "workspace" as const,
  workingCopyChangeId: state.workingCopy.changeId,
  bookmarkName: state.candidates[0] ?? null,
  expectedTargets:
    state.bookmarks.find((entry) => entry.remote === null && entry.name === state.candidates[0])
      ?.targets ?? [],
});
const local = (state: BookmarkState, name: string) =>
  state.bookmarks.find((bookmark) => bookmark.remote === null && bookmark.name === name)!;

async function repository(t: TestContext, colocated = true) {
  const directory = await mkdtemp(join(tmpdir(), "paseo-jj-bookmarks-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repo = join(directory, "repo");
  const remote = join(directory, "remote.git");
  await mkdir(repo);
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await jj(repo, "git", "init", colocated ? "--colocate" : "--no-colocate");
  await jj(repo, "git", "remote", "add", "origin", remote);
  await writeFile(join(repo, "base.txt"), "base\n");
  await jj(repo, "describe", "-m", "base");
  await jj(repo, "bookmark", "create", "main");
  await jj(repo, "git", "push", "--bookmark", "main");
  await jj(repo, "new", "main");
  return { repo, directory, remote };
}

async function feature(repo: string, name = "feature") {
  await writeFile(join(repo, "feature.txt"), "feature\n");
  await jj(repo, "describe", "-m", "feature");
  const state = await readBookmarkState(repo);
  await runBookmarkAction(repo, { kind: "create", name, target: workspace(state), publish: false });
  return readBookmarkState(repo);
}

test("workspace shortcuts skip an empty @ and exclude immutable/trunk bookmarks", async (t) => {
  const { repo } = await repository(t);
  const state = await readBookmarkState(repo);
  assert.equal(state.usesParent, true);
  assert.equal(state.target.commitId, local(state, "main").targets[0]);
  assert.deepEqual(state.candidates, []);
  const message = await runBookmarkAction(repo, {
    kind: "create",
    name: "topic",
    target: workspace(state),
    publish: false,
  });
  assert.match(message, /locally/);
  assert.equal(local(await readBookmarkState(repo), "topic").targets[0], state.target.commitId);
});

test("the first push tracks a new local bookmark without a track action", async (t) => {
  const { repo, remote } = await repository(t);
  const state = await feature(repo);
  assert.equal(state.usesParent, false);
  assert.deepEqual(state.candidates, ["feature"]);
  assert.equal(
    state.bookmarks.some((entry) => entry.name === "feature" && entry.remote === "origin"),
    false,
  );
  await runBookmarkAction(repo, { kind: "push", remote: "origin", subject: workspace(state) });
  const pushed = await readBookmarkState(repo);
  assert.equal(
    pushed.bookmarks.find((entry) => entry.name === "feature" && entry.remote === "origin")
      ?.tracked,
    true,
  );
  const { stdout } = await execFileAsync("git", [
    "--git-dir",
    remote,
    "rev-parse",
    "refs/heads/feature",
  ]);
  assert.equal(stdout.trim(), local(pushed, "feature").targets[0]);
});

test("an explicit push tracks a new remote even when another remote is already tracked", async (t) => {
  const { repo, directory } = await repository(t);
  const state = await feature(repo);
  await runBookmarkAction(repo, { kind: "push", remote: "origin", subject: workspace(state) });
  const backup = join(directory, "backup.git");
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", backup]);
  await jj(repo, "git", "remote", "add", "backup", backup);
  const before = await readBookmarkState(repo);
  await runBookmarkAction(repo, {
    kind: "push",
    remote: "backup",
    subject: {
      kind: "bookmark",
      name: "feature",
      expectedTargets: local(before, "feature").targets,
    },
  });
  const after = await readBookmarkState(repo);
  for (const remote of ["origin", "backup"]) {
    const entry = after.bookmarks.find(
      (bookmark) => bookmark.name === "feature" && bookmark.remote === remote,
    );
    assert.equal(entry?.tracked, true);
    assert.deepEqual(entry?.targets, local(before, "feature").targets);
  }
  const { stdout } = await execFileAsync("git", [
    "--git-dir",
    backup,
    "rev-parse",
    "refs/heads/feature",
  ]);
  assert.equal(stdout.trim(), local(before, "feature").targets[0]);
});

test("create-and-push snapshots dirty work into @ before resolving the target", async (t) => {
  const { repo } = await repository(t);
  const state = await readBookmarkState(repo);
  assert.equal(state.usesParent, true);
  await writeFile(join(repo, "unsnapshotted.txt"), "new work\n");
  // Describe first so jj's normal push validation allows the completed change.
  await jj(repo, "describe", "-m", "new work");
  await writeFile(join(repo, "unsnapshotted.txt"), "more unsnapshotted work\n");
  await runBookmarkAction(repo, {
    kind: "create",
    name: "published",
    target: workspace(state),
    publish: true,
    remote: "origin",
  });
  const result = await readBookmarkState(repo);
  assert.equal(local(result, "published").targets[0], result.workingCopy.commitId);
  assert.equal(
    result.bookmarks.find((entry) => entry.name === "published" && entry.remote === "origin")
      ?.tracked,
    true,
  );
  assert.equal(
    await runJj(repo, ["file", "show", "-r", "published", "unsnapshotted.txt"]),
    "more unsnapshotted work\n",
  );
});

test("Tug advances the nearest branch bookmark and Push does not move it implicitly", async (t) => {
  const { repo } = await repository(t);
  let state = await feature(repo);
  const oldTarget = local(state, "feature").targets[0];
  await jj(repo, "new", "-m", "next work");
  await writeFile(join(repo, "next.txt"), "next\n");
  await jj(repo, "util", "snapshot");
  state = await readBookmarkState(repo);
  await runBookmarkAction(repo, { kind: "push", remote: "origin", subject: workspace(state) });
  assert.equal(local(await readBookmarkState(repo), "feature").targets[0], oldTarget);
  await runBookmarkAction(repo, {
    kind: "tug",
    workingCopyChangeId: state.workingCopy.changeId,
    name: "feature",
  });
  assert.equal(
    local(await readBookmarkState(repo), "feature").targets[0],
    state.workingCopy.commitId,
  );
});

test("ambiguous bookmarks require an explicit choice and never move together", async (t) => {
  const { repo } = await repository(t);
  const state = await feature(repo);
  await jj(repo, "bookmark", "create", "second");
  await jj(repo, "new", "-m", "more");
  await writeFile(join(repo, "more.txt"), "more\n");
  await jj(repo, "util", "snapshot");
  const before = await readBookmarkState(repo);
  assert.deepEqual(before.candidates.sort(), ["feature", "second"]);
  await assert.rejects(
    runBookmarkAction(repo, { kind: "tug", workingCopyChangeId: before.workingCopy.changeId }),
    /More than one/,
  );
  await assert.rejects(
    runBookmarkAction(repo, {
      kind: "push",
      remote: "origin",
      subject: { ...workspace(before), bookmarkName: null, expectedTargets: [] },
    }),
    /More than one/,
  );
  await runBookmarkAction(repo, {
    kind: "push",
    remote: "origin",
    subject: {
      ...workspace(before),
      bookmarkName: "second",
      expectedTargets: local(before, "second").targets,
    },
  });
  const pushed = await readBookmarkState(repo);
  assert.deepEqual(
    pushed.bookmarks.find((entry) => entry.name === "second" && entry.remote === "origin")?.targets,
    local(before, "second").targets,
  );
  assert.equal(
    pushed.bookmarks.some((entry) => entry.name === "feature" && entry.remote === "origin"),
    false,
  );
  await runBookmarkAction(repo, {
    kind: "tug",
    workingCopyChangeId: before.workingCopy.changeId,
    name: "feature",
  });
  const after = await readBookmarkState(repo);
  assert.equal(local(after, "second").targets[0], local(state, "feature").targets[0]);
  assert.equal(local(after, "feature").targets[0], before.workingCopy.commitId);
  await runBookmarkAction(repo, {
    kind: "push",
    remote: "origin",
    subject: workspace(after),
  });
  const final = await readBookmarkState(repo);
  assert.deepEqual(
    final.bookmarks.find((entry) => entry.name === "feature" && entry.remote === "origin")?.targets,
    local(after, "feature").targets,
  );
  assert.deepEqual(
    final.bookmarks.find((entry) => entry.name === "second" && entry.remote === "origin")?.targets,
    local(before, "second").targets,
  );
});

test("explicit moves allow backwards/sideways movement but reject stale sources", async (t) => {
  const { repo } = await repository(t);
  const state = await feature(repo);
  const bookmark = local(state, "feature");
  const main = local(state, "main").targets[0];
  const [changeId] = (
    await runJj(repo, ["log", "--no-graph", "-r", main, "-T", "change_id"])
  ).split("\n");
  const action: BookmarkAction = {
    kind: "move",
    name: "feature",
    expectedTargets: bookmark.targets,
    target: { kind: "change", commitId: main, changeId },
  };
  await runBookmarkAction(repo, action);
  assert.equal(local(await readBookmarkState(repo), "feature").targets[0], main);
  await assert.rejects(runBookmarkAction(repo, action), /moved since/);
});

test("tracking/untracking and rename/delete act on exact bookmarks", async (t) => {
  const { repo } = await repository(t);
  const state = await feature(repo);
  await runBookmarkAction(repo, { kind: "push", remote: "origin", subject: workspace(state) });
  await runBookmarkAction(repo, { kind: "untrack", remote: "origin", name: "feature" });
  assert.equal(
    (await readBookmarkState(repo)).bookmarks.find(
      (entry) => entry.name === "feature" && entry.remote === "origin",
    )?.tracked,
    false,
  );
  await runBookmarkAction(repo, { kind: "track", remote: "origin", name: "feature" });
  assert.equal(
    (await readBookmarkState(repo)).bookmarks.find(
      (entry) => entry.name === "feature" && entry.remote === "origin",
    )?.tracked,
    true,
  );
  await runBookmarkAction(repo, {
    kind: "rename",
    name: "feature",
    newName: "renamed",
    expectedTargets: local(await readBookmarkState(repo), "feature").targets,
  });
  const renamed = await readBookmarkState(repo);
  assert.ok(local(renamed, "renamed"));
  await runBookmarkAction(repo, {
    kind: "delete",
    name: "renamed",
    expectedTargets: local(renamed, "renamed").targets,
  });
  assert.equal(
    (await readBookmarkState(repo)).bookmarks.some(
      (entry) => entry.name === "renamed" && entry.remote === null && entry.targets.length > 0,
    ),
    false,
  );
});

test("Fetch imports remote updates without rebasing the workspace", async (t) => {
  const { repo, remote } = await repository(t);
  const { stdout: base } = await execFileAsync("git", [
    "--git-dir",
    remote,
    "rev-parse",
    "refs/heads/main",
  ]);
  await execFileAsync("git", [
    "--git-dir",
    remote,
    "update-ref",
    "refs/heads/incoming",
    base.trim(),
  ]);
  const before = await readBookmarkState(repo);
  await runBookmarkAction(repo, { kind: "fetch", remote: "origin" });
  const after = await readBookmarkState(repo);
  assert.equal(after.workingCopy.changeId, before.workingCopy.changeId);
  assert.equal(after.workingCopy.commitId, before.workingCopy.commitId);
  assert.ok(
    after.bookmarks.some((entry) => entry.remote === "origin" && entry.name === "incoming"),
  );
});

test("an explicit push failure keeps the local bookmark and reports the partial result", async (t) => {
  const { repo } = await repository(t);
  const state = await readBookmarkState(repo);
  await writeFile(join(repo, "no-description.txt"), "pending work\n");
  await assert.rejects(
    runBookmarkAction(repo, {
      kind: "create",
      name: "needs-description",
      target: workspace(state),
      publish: true,
      remote: "origin",
    }),
    /Created .* locally, but push failed/,
  );
  assert.ok(local(await readBookmarkState(repo), "needs-description"));
  assert.equal(await readFile(join(repo, "no-description.txt"), "utf8"), "pending work\n");
});

test("push re-tracks an existing untracked remote bookmark", async (t) => {
  const { repo } = await repository(t);
  const state = await feature(repo);
  await runBookmarkAction(repo, { kind: "push", remote: "origin", subject: workspace(state) });
  await runBookmarkAction(repo, { kind: "untrack", remote: "origin", name: "feature" });
  const untracked = await readBookmarkState(repo);
  await runBookmarkAction(repo, {
    kind: "push",
    remote: "origin",
    subject: {
      kind: "bookmark",
      name: "feature",
      expectedTargets: local(untracked, "feature").targets,
    },
  });
  assert.equal(
    (await readBookmarkState(repo)).bookmarks.find(
      (entry) => entry.name === "feature" && entry.remote === "origin",
    )?.tracked,
    true,
  );
});

test("bookmark actions work without a colocated Git working tree", async (t) => {
  const { repo } = await repository(t, false);
  const state = await feature(repo);
  await runBookmarkAction(repo, { kind: "push", remote: "origin", subject: workspace(state) });
  assert.equal(
    (await readBookmarkState(repo)).bookmarks.find(
      (entry) => entry.name === "feature" && entry.remote === "origin",
    )?.tracked,
    true,
  );
});

test("queued operations serialize across sibling workspaces and scope their status to the caller", async (t) => {
  const { repo, directory } = await repository(t);
  const sibling = join(directory, "sibling");
  await jj(repo, "workspace", "add", "--name", "sibling", "-r", "main", sibling);
  const service = createBookmarkOperations();
  t.after(() => service.dispose());
  const context = {
    paseo: {
      workspaces: {
        ref: (id: string) => ({
          refresh: async () => ({ workspaceDirectory: id === "first" ? repo : sibling }),
        }),
      },
    },
  } as unknown as PluginHandlerContext;
  const initial = await readBookmarkState(repo);
  const first = await service.start(
    {
      workspaceId: "first",
      action: { kind: "create", name: "queued", target: workspace(initial), publish: false },
    },
    context,
  );
  assert.ok(["queued", "running"].includes(first.status));
  const second = await service.start(
    {
      workspaceId: "second",
      action: {
        kind: "rename",
        name: "queued",
        newName: "after-queue",
        expectedTargets: [initial.target.commitId],
      },
    },
    context,
  );
  assert.throws(
    () => service.operation({ workspaceId: "first", operationId: second.id }),
    /unavailable/,
  );
  let result = service.operation({ workspaceId: "second", operationId: second.id });
  for (let count = 0; ["queued", "running"].includes(result.status) && count < 100; count++) {
    await delay(20);
    result = service.operation({ workspaceId: "second", operationId: second.id });
  }
  assert.equal(result.status, "succeeded", result.message);
  assert.equal(
    service.operation({ workspaceId: "first", operationId: first.id }).status,
    "succeeded",
  );
  assert.ok(local(await readBookmarkState(repo), "after-queue"));
});

test("workspace actions reject a changed checkout and push rejects a moved source", async (t) => {
  const { repo } = await repository(t);
  const original = await feature(repo);
  await jj(repo, "new", "-m", "different change");
  await assert.rejects(
    runBookmarkAction(repo, { kind: "tug", workingCopyChangeId: original.workingCopy.changeId }),
    /different change/,
  );
  const current = await readBookmarkState(repo);
  await jj(repo, "bookmark", "move", "feature", "--to", "@");
  await assert.rejects(
    runBookmarkAction(repo, { kind: "push", subject: workspace(current), remote: "origin" }),
    /moved since/,
  );
});

test("an abandoned drop target is rejected instead of moving a bookmark to hidden history", async (t) => {
  const { repo } = await repository(t);
  const original = await feature(repo);
  await jj(repo, "new", "-m", "temporary target");
  const target = (await readBookmarkState(repo)).workingCopy;
  await jj(repo, "abandon", "@");
  await assert.rejects(
    runBookmarkAction(repo, {
      kind: "move",
      name: "feature",
      expectedTargets: local(original, "feature").targets,
      target: { kind: "change", ...target },
    }),
    /rewritten or abandoned/,
  );
  assert.deepEqual(
    local(await readBookmarkState(repo), "feature").targets,
    local(original, "feature").targets,
  );
});

test("Create & Push requires a remote before creating a local bookmark", async (t) => {
  const { repo } = await repository(t);
  const state = await readBookmarkState(repo);
  await assert.rejects(
    runBookmarkAction(repo, {
      kind: "create",
      name: "missing-remote",
      target: workspace(state),
      publish: true,
    }),
    /Choose an available Git remote/,
  );
  assert.equal(
    (await readBookmarkState(repo)).bookmarks.some((entry) => entry.name === "missing-remote"),
    false,
  );
});
