import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, test, type TestContext } from "node:test";
import { promisify } from "node:util";
import type { PluginBeforeRequests, PluginHookContext } from "@getpaseo/plugin/server";
import { archiveWorkspace, createWorkspace } from "./workspaces.js";

const execFileAsync = promisify(execFile);
type PaseoWorkspaceListOptions = NonNullable<
  Parameters<PluginHookContext["paseo"]["workspaces"]["list"]>[0]
>;
const configDirectory = await mkdtemp(join(tmpdir(), "paseo-jj-config-"));
const configPath = join(configDirectory, "config.toml");
await writeFile(configPath, '[user]\nname = "Test"\nemail = "test@example.invalid"\n');
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

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "paseo-jj-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repo = join(directory, "My app");
  const workspacesRoot = join(directory, "workspaces");
  await mkdir(repo);
  return { directory, repo, workspacesRoot };
}

async function repository(t: TestContext, colocated = true) {
  const paths = await fixture(t);
  await jj(paths.repo, "git", "init", colocated ? "--colocate" : "--no-colocate");
  await writeFile(join(paths.repo, "base.txt"), "committed\n");
  await mkdir(join(paths.repo, "package"));
  await writeFile(join(paths.repo, "package", "index.txt"), "package content\n");
  await jj(paths.repo, "describe", "-m", "base");
  await jj(paths.repo, "new", "-m", "source changes");
  await writeFile(join(paths.repo, "base.txt"), "uncommitted\n");
  await writeFile(join(paths.repo, "source-only.txt"), "source only\n");
  return paths;
}

function options(repo: string, workspacesRoot: string) {
  return {
    signal: new AbortController().signal,
    workspacesRoot,
    listProjects: async () => ({
      requestId: "test-projects",
      projects: [
        {
          projectId: "project",
          projectDisplayName: "My app",
          projectRootPath: repo,
          projectKind: "git" as const,
        },
      ],
    }),
  };
}

test("creates a registered jj workspace from the source parents and preserves the request", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  const request: PluginBeforeRequests["workspace.create"] = {
    source: { kind: "directory", path: repo, projectId: "project" },
    title: "A task",
    workspaceId: "wks_0123456789abcdef",
    idempotencyKey: "create-task",
    firstAgentContext: { prompt: "Do a task" },
  };
  const result = await createWorkspace({ request, ...options(repo, workspacesRoot) });
  assert.equal(result.source.kind, "directory");
  if (result.source.kind !== "directory") throw new Error("Expected directory source");
  const destination = result.source.path;
  const name = basename(destination);
  assert.match(name, /^My-app-[a-z]+-[a-z]+$/);
  assert.equal(destination, join(workspacesRoot, name));
  assert.equal(result.source.projectId, "project");
  assert.deepEqual({ ...result, source: request.source }, request);
  assert.equal(await jj(destination, "root"), destination);
  assert.match(await jj(repo, "workspace", "list"), new RegExp(name));
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
  await assert.rejects(readFile(join(destination, "source-only.txt")), { code: "ENOENT" });
  assert.match(await readFile(join(destination, ".git"), "utf8"), /^gitdir: /);
  const gitRoot = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
    cwd: destination,
  });
  assert.equal(gitRoot.stdout.trim(), destination);
  assert.equal(await readFile(join(repo, "base.txt"), "utf8"), "uncommitted\n");
  assert.equal(
    await jj(destination, "log", "--no-graph", "-r", "@-", "-T", "commit_id"),
    await jj(repo, "log", "--no-graph", "-r", "@-", "-T", "commit_id"),
  );
});

test("preserves a subdirectory selected through a symlink in a non-colocated repository", async (t) => {
  const { directory, repo, workspacesRoot } = await repository(t, false);
  const link = join(directory, "repo-link");
  await symlink(repo, link);
  const result = await createWorkspace({
    request: { source: { kind: "directory", path: join(link, "package"), projectId: "project" } },
    ...options(repo, workspacesRoot),
  });
  assert.equal(result.source.kind, "directory");
  if (result.source.kind !== "directory") throw new Error("Expected directory source");
  assert.equal(basename(result.source.path), "package");
  assert.equal(await readFile(join(result.source.path, "index.txt"), "utf8"), "package content\n");
  await assert.rejects(readFile(join(result.source.path, "..", ".git")), { code: "ENOENT" });
});

test("converts project-only Worktree requests and uses unique names for concurrent creation", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  const request: PluginBeforeRequests["workspace.create"] = {
    source: { kind: "worktree", projectId: "project", action: "branch-off" },
  };
  const results = await Promise.all([
    createWorkspace({ request, ...options(repo, workspacesRoot) }),
    createWorkspace({ request, ...options(repo, workspacesRoot) }),
  ]);
  const paths = results.map((result) => {
    assert.equal(result.source.kind, "directory");
    if (result.source.kind !== "directory") throw new Error("Expected directory source");
    assert.equal(result.source.projectId, "project");
    return result.source.path;
  });
  assert.notEqual(paths[0], paths[1]);
  assert.equal((await readdir(workspacesRoot)).length, 2);
  for (const path of paths) assert.equal(await jj(path, "root"), path);
});

test("leaves non-jj requests untouched without querying Paseo or creating directories", async (t) => {
  const { repo, workspacesRoot } = await fixture(t);
  await execFileAsync("git", ["init", repo]);
  for (const source of [
    { kind: "directory" as const, path: repo, projectId: "project" },
    { kind: "worktree" as const, cwd: repo, projectId: "project" },
  ]) {
    const request = { source };
    const result = await createWorkspace({
      request,
      ...options(repo, workspacesRoot),
      listProjects: async () => {
        throw new Error("Unexpected Paseo query");
      },
    });
    assert.equal(result, request);
  }
  await assert.rejects(readdir(workspacesRoot), { code: "ENOENT" });
});

test("rejects Git checkout requests in jj repositories before creating anything", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  await assert.rejects(
    createWorkspace({
      request: { source: { kind: "worktree", cwd: repo, action: "checkout", refName: "main" } },
      ...options(repo, workspacesRoot),
    }),
    /cannot check out Git branches or pull requests/,
  );
  await assert.rejects(readdir(workspacesRoot), { code: "ENOENT" });
});

test("surfaces jj failures instead of falling back to the source directory", async (t) => {
  const { repo, workspacesRoot } = await fixture(t);
  await mkdir(join(repo, ".jj"));
  await assert.rejects(
    createWorkspace({
      request: { source: { kind: "directory", path: repo } },
      ...options(repo, workspacesRoot),
    }),
    /Command failed/,
  );
  await assert.rejects(readdir(workspacesRoot), { code: "ENOENT" });
});

test("honors an already canceled hook without creating a workspace", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  await assert.rejects(
    createWorkspace({
      request: { source: { kind: "directory", path: repo } },
      ...options(repo, workspacesRoot),
      signal: AbortSignal.abort(),
    }),
    { name: "AbortError" },
  );
  await assert.rejects(readdir(workspacesRoot), { code: "ENOENT" });
});

function archiveOptions(cwd: string, workspacesRoot: string) {
  return {
    signal: new AbortController().signal,
    workspacesRoot,
    workspace: {
      id: "archived",
      projectId: "project",
      cwd,
      name: null,
      archivedAt: "2026-10-15T00:00:00.000Z",
    },
    listWorkspaces: async (_options: PaseoWorkspaceListOptions) => ({
      entries: [],
      pageInfo: { hasMore: false, nextCursor: null, prevCursor: null },
    }),
  };
}

async function managedWorkspace(t: TestContext, colocated = true) {
  const paths = await repository(t, colocated);
  const result = await createWorkspace({
    request: { source: { kind: "directory", path: paths.repo, projectId: "project" } },
    ...options(paths.repo, paths.workspacesRoot),
  });
  if (result.source.kind !== "directory") throw new Error("Expected directory source");
  return { ...paths, destination: result.source.path };
}

test("retries name collisions without modifying existing directories or workspace registrations", async (t) => {
  const { directory, repo, workspacesRoot } = await repository(t);
  await mkdir(join(workspacesRoot, "My-app-quiet-otter"), { recursive: true });
  await writeFile(join(workspacesRoot, "My-app-quiet-otter", "keep.txt"), "keep\n");
  await jj(repo, "workspace", "add", "--name", "My-app-calm-fox", join(directory, "elsewhere"));
  const names = ["quiet-otter", "calm-fox", "bright-owl"];
  const result = await createWorkspace({
    request: { source: { kind: "directory", path: repo, projectId: "project" } },
    ...options(repo, workspacesRoot),
    generateName: () => {
      const name = names.shift();
      if (!name) throw new Error("Unexpected additional name attempt");
      return name;
    },
  });
  if (result.source.kind !== "directory") throw new Error("Expected directory source");
  assert.equal(basename(result.source.path), "My-app-bright-owl");
  assert.equal(
    await readFile(join(workspacesRoot, "My-app-quiet-otter", "keep.txt"), "utf8"),
    "keep\n",
  );
  assert.equal(
    await jj(repo, "workspace", "root", "--name", "My-app-calm-fox"),
    join(directory, "elsewhere"),
  );
});

for (const colocated of [true, false]) {
  test(`archive snapshots pending changes and removes the jj workspace (${colocated ? "colocated" : "non-colocated"})`, async (t) => {
    const { repo, destination, workspacesRoot } = await managedWorkspace(t, colocated);
    await writeFile(join(destination, "base.txt"), "pending at archive\n");
    const changeId = await jj(destination, "log", "--no-graph", "-r", "@", "-T", "change_id");
    await writeFile(join(destination, "base.txt"), "last unsnapshotted edit\n");
    await archiveWorkspace(archiveOptions(destination, workspacesRoot));
    await assert.rejects(readdir(destination), { code: "ENOENT" });
    assert.equal(await jj(repo, "workspace", "list", "-T", 'name ++ "\\n"'), "default");
    assert.equal(
      await jj(repo, "file", "show", "-r", changeId, "base.txt"),
      "last unsnapshotted edit",
    );
    if (colocated) {
      const gitWorktrees = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
        cwd: repo,
      });
      assert.equal(gitWorktrees.stdout.includes(destination), false);
    }
    await archiveWorkspace(archiveOptions(destination, workspacesRoot));
    assert.equal(await readFile(join(repo, "base.txt"), "utf8"), "uncommitted\n");
  });
}

test("keeps a shared directory until its last active workspace is archived, including background and later pages", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  const alias = join(workspacesRoot, "alias");
  await symlink(destination, alias);
  const calls: PaseoWorkspaceListOptions[] = [];
  await archiveWorkspace({
    ...archiveOptions(destination, workspacesRoot),
    listWorkspaces: async (input) => {
      calls.push(input);
      if (!input.page?.cursor) {
        return {
          entries: [],
          pageInfo: { hasMore: true, nextCursor: "second-page", prevCursor: null },
        };
      }
      return {
        entries: [{ id: "active-background-sibling", workspaceDirectory: join(alias, "package") }],
        pageInfo: { hasMore: false, nextCursor: null, prevCursor: null },
      };
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { includeBackground: true, page: { limit: 200 } });
  assert.equal(calls[1].page?.cursor, "second-page");
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
  await archiveWorkspace({
    ...archiveOptions(join(destination, "package"), workspacesRoot),
    workspace: {
      ...archiveOptions(destination, workspacesRoot).workspace,
      id: "active-background-sibling",
      cwd: join(destination, "package"),
    },
  });
  await assert.rejects(readdir(destination), { code: "ENOENT" });
});

test("does not remove unmarked jj workspaces or directories outside the managed root", async (t) => {
  const { directory, repo, destination, workspacesRoot } = await managedWorkspace(t);
  const unmarked = join(workspacesRoot, "unmarked");
  await jj(repo, "workspace", "add", "--name", "unmarked", unmarked);
  await archiveWorkspace(archiveOptions(unmarked, workspacesRoot));
  assert.equal(await jj(unmarked, "root"), unmarked);
  await archiveWorkspace(archiveOptions(repo, workspacesRoot));
  assert.equal(await readFile(join(repo, "base.txt"), "utf8"), "uncommitted\n");
  await archiveWorkspace(archiveOptions(destination, join(directory, "different-root")));
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
});

test("rejects mismatched ownership markers and leaves the workspace intact", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  await writeFile(
    join(destination, ".jj", "paseo-jj.json"),
    JSON.stringify({
      version: 1,
      name: "default",
      directory: destination,
    }),
  );
  await assert.rejects(
    archiveWorkspace(archiveOptions(destination, workspacesRoot)),
    /ownership does not match/,
  );
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
});

test("keeps files when the active-workspace check fails, and can retry after a failure", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  await assert.rejects(
    archiveWorkspace({
      ...archiveOptions(destination, workspacesRoot),
      listWorkspaces: async () => {
        throw new Error("Daemon unavailable");
      },
    }),
    /Daemon unavailable/,
  );
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
  await archiveWorkspace(archiveOptions(destination, workspacesRoot));
  await assert.rejects(readdir(destination), { code: "ENOENT" });
});

test("serializes overlapping archive events for the same directory", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  await Promise.all([
    archiveWorkspace(archiveOptions(destination, workspacesRoot)),
    archiveWorkspace(archiveOptions(destination, workspacesRoot)),
  ]);
  await assert.rejects(readdir(destination), { code: "ENOENT" });
});

test("preserves active references to missing subdirectories and cleans up when their last record is archived", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  const missing = join(destination, "package");
  await rm(missing, { recursive: true });
  await archiveWorkspace({
    ...archiveOptions(destination, workspacesRoot),
    listWorkspaces: async () => ({
      entries: [{ id: "sibling", workspaceDirectory: missing }],
      pageInfo: { hasMore: false, nextCursor: null, prevCursor: null },
    }),
  });
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
  await archiveWorkspace(archiveOptions(missing, workspacesRoot));
  await assert.rejects(readdir(destination), { code: "ENOENT" });
});

test("aborts cleanup if canceled during the active-workspace check", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  const controller = new AbortController();
  await assert.rejects(
    archiveWorkspace({
      ...archiveOptions(destination, workspacesRoot),
      signal: controller.signal,
      listWorkspaces: async () => {
        controller.abort();
        return { entries: [], pageInfo: { hasMore: false, nextCursor: null, prevCursor: null } };
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
});

test("refuses cleanup when pagination cannot prove there are no active references", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  await assert.rejects(
    archiveWorkspace({
      ...archiveOptions(destination, workspacesRoot),
      listWorkspaces: async () => ({
        entries: [],
        pageInfo: { hasMore: true, nextCursor: null, prevCursor: null },
      }),
    }),
    /incomplete workspace listing/,
  );
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
});

test("preserves active references through symlinks even when the working subdirectory is missing", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  const alias = join(workspacesRoot, "alias");
  await symlink(destination, alias);
  await rm(join(destination, "package"), { recursive: true });
  await archiveWorkspace({
    ...archiveOptions(destination, workspacesRoot),
    listWorkspaces: async () => ({
      entries: [{ id: "sibling", workspaceDirectory: join(alias, "package") }],
      pageInfo: { hasMore: false, nextCursor: null, prevCursor: null },
    }),
  });
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
});

test("preserves a workspace restored before its archive event is handled", async (t) => {
  const { destination, workspacesRoot } = await managedWorkspace(t);
  await archiveWorkspace({
    ...archiveOptions(destination, workspacesRoot),
    listWorkspaces: async () => ({
      entries: [{ id: "archived", workspaceDirectory: destination }],
      pageInfo: { hasMore: false, nextCursor: null, prevCursor: null },
    }),
  });
  assert.equal(await readFile(join(destination, "base.txt"), "utf8"), "committed\n");
});

test("rolls back a new jj workspace if writing its ownership marker fails", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  await assert.rejects(
    createWorkspace({
      request: { source: { kind: "directory", path: repo, projectId: "project" } },
      ...options(repo, workspacesRoot),
      writeMarker: async () => {
        throw new Error("Disk full while writing ownership marker");
      },
    }),
    /Disk full while writing ownership marker/,
  );
  assert.deepEqual(await readdir(workspacesRoot), []);
  assert.equal(await jj(repo, "workspace", "list", "-T", 'name ++ "\\n"'), "default");
  const gitWorktrees = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
    cwd: repo,
  });
  assert.equal(gitWorktrees.stdout.includes(workspacesRoot), false);
});

test("rolls back a new workspace if creation is canceled after jj workspace add succeeds", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  const controller = new AbortController();
  await assert.rejects(
    createWorkspace({
      request: { source: { kind: "directory", path: repo, projectId: "project" } },
      ...options(repo, workspacesRoot),
      signal: controller.signal,
      writeMarker: async (...args) => {
        await writeFile(...args);
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.deepEqual(await readdir(workspacesRoot), []);
  assert.equal(await jj(repo, "workspace", "list", "-T", 'name ++ "\\n"'), "default");
});

test("honors the local and remote Git refs supplied by Paseo's branch picker", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  const base = await jj(repo, "log", "--no-graph", "-r", "@-", "-T", "commit_id");
  const remoteBase = await jj(repo, "log", "--no-graph", "-r", "@", "-T", "commit_id");
  await execFileAsync("git", ["update-ref", "refs/heads/main", base], { cwd: repo });
  await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", remoteBase], { cwd: repo });
  await jj(repo, "new", "-m", "feature parent");
  const sourceParent = await jj(repo, "log", "--no-graph", "-r", "@-", "-T", "commit_id");
  assert.notEqual(sourceParent, base);

  for (const selection of [
    { refName: "refs/heads/main", revision: base, content: "committed\n" },
    { refName: "refs/remotes/origin/main", revision: remoteBase, content: "uncommitted\n" },
    { refName: "main", revision: base, content: "committed\n" },
    { refName: "origin/main", revision: remoteBase, content: "uncommitted\n" },
  ]) {
    const result = await createWorkspace({
      request: {
        source: {
          kind: "worktree",
          cwd: repo,
          projectId: "project",
          action: "branch-off",
          refName: selection.refName,
          baseBranch: "ignored-because-refName-is-supplied",
        },
      },
      ...options(repo, workspacesRoot),
    });
    if (result.source.kind !== "directory") throw new Error("Expected directory source");
    assert.equal(
      await jj(result.source.path, "log", "--no-graph", "-r", "@-", "-T", "commit_id"),
      selection.revision,
    );
    assert.equal(await readFile(join(result.source.path, "base.txt"), "utf8"), selection.content);
  }
});

test("resolves baseBranch through the backing Git store for non-colocated repos", async (t) => {
  const { repo, workspacesRoot } = await repository(t, false);
  const gitRoot = await jj(repo, "git", "root");
  const base = await jj(repo, "log", "--no-graph", "-r", "@-", "-T", "commit_id");
  await execFileAsync(
    "git",
    ["--git-dir", gitRoot, "update-ref", "refs/remotes/origin/main", base],
    { cwd: repo },
  );
  await jj(repo, "new", "-m", "feature parent");
  const result = await createWorkspace({
    request: { source: { kind: "worktree", cwd: repo, baseBranch: "main" } },
    ...options(repo, workspacesRoot),
  });
  if (result.source.kind !== "directory") throw new Error("Expected directory source");
  assert.equal(
    await jj(result.source.path, "log", "--no-graph", "-r", "@-", "-T", "commit_id"),
    base,
  );
});

test("rejects an unknown base without leaving a workspace or falling back to source parents", async (t) => {
  const { repo, workspacesRoot } = await repository(t);
  await assert.rejects(
    createWorkspace({
      request: { source: { kind: "worktree", cwd: repo, refName: "missing-branch" } },
      ...options(repo, workspacesRoot),
    }),
    /Git base branch "missing-branch" was not found locally/,
  );
  await assert.rejects(readdir(workspacesRoot), { code: "ENOENT" });
  assert.equal(await jj(repo, "workspace", "list", "-T", 'name ++ "\\n"'), "default");
});
