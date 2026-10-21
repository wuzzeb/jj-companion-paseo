import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type {
  PluginBeforeRequests,
  PluginHookContext,
  PluginHookWorkspace,
} from "@getpaseo/plugin/server";
import { createNameId } from "./names.js";
import { runWorktreeLifecycle } from "./lifecycle.js";
import { readCodexWritableRoots } from "./codex-config.js";
import { findJjRoot } from "./repository.js";

const execFileAsync = promisify(execFile);
const ownershipSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    directory: z.string().min(1),
    sourceDirectory: z.string().min(1).optional(),
  })
  .strict();
const markerName = "paseo-jj-companion.json";
// Workspaces created before the rename remain owned by this plugin.
const legacyMarkerName = "paseo-jj-workspace-plugin.json";
type WorkspaceRequest = PluginBeforeRequests["workspace.create"];
type ListWorkspaces = PluginHookContext["paseo"]["workspaces"]["list"];
type WorkspaceListResult = Awaited<ReturnType<ListWorkspaces>>;
type WorkspacePage = Pick<WorkspaceListResult, "pageInfo"> & {
  entries: Pick<WorkspaceListResult["entries"][number], "workspaceDirectory">[];
};
type WorkspaceListOptions = NonNullable<Parameters<ListWorkspaces>[0]>;

interface CreateWorkspaceOptions {
  request: WorkspaceRequest;
  signal: AbortSignal;
  listProjects: PluginHookContext["paseo"]["projects"]["list"];
  workspacesRoot?: string;
  generateName?: () => string;
  writeMarker?: typeof writeFile;
}

interface ArchiveWorkspaceOptions {
  workspace: PluginHookWorkspace;
  signal: AbortSignal;
  listWorkspaces: (options: WorkspaceListOptions) => Promise<WorkspacePage>;
  workspacesRoot?: string;
}

function defaultWorkspacesRoot(): string {
  return join(homedir(), "projects", "paseo-workspaces");
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function hasCode(error: unknown, code: string | number): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function optionalRealpath(path: string): Promise<string | null> {
  try {
    return await realpath(expandHome(path));
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function resolveWorkspacePath(path: string): Promise<string> {
  const absolute = resolve(expandHome(path));
  const canonical = await optionalRealpath(absolute);
  if (canonical) return canonical;
  const parent = dirname(absolute);
  if (parent === absolute) return absolute;
  return join(await resolveWorkspacePath(parent), basename(absolute));
}

async function jj(cwd: string, signal: AbortSignal, ...args: string[]): Promise<string> {
  signal.throwIfAborted();
  const { stdout } = await execFileAsync("jj", ["--no-pager", "--color=never", ...args], {
    cwd,
    signal,
    timeout: 25_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

export async function configureCodexAgent({
  request,
  signal,
  readWritableRoots = readCodexWritableRoots,
}: {
  request: PluginBeforeRequests["agent.create"];
  signal: AbortSignal;
  readWritableRoots?: typeof readCodexWritableRoots;
}): Promise<PluginBeforeRequests["agent.create"]> {
  signal.throwIfAborted();
  if (request.config.provider !== "codex") return request;
  const cwd = await realpath(expandHome(request.config.cwd));
  const root = await findJjRoot(cwd);
  if (!root) return request;

  const repoPath = join(root, ".jj", "repo");
  const repo = (await stat(repoPath)).isDirectory()
    ? await realpath(repoPath)
    : await realpath(resolve(root, ".jj", (await readFile(repoPath, "utf8")).trim()));
  const roots = [dirname(repo)];
  if (await optionalRealpath(join(root, ".git"))) {
    const { stdout } = await execFileAsync(
      "git",
      [
        "--no-optional-locks",
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
        "--git-dir",
      ],
      { cwd: root, signal, timeout: 25_000, maxBuffer: 1024 * 1024 },
    );
    for (const path of stdout.trim().split("\n")) roots.push(await realpath(path));
  }

  const options = request.config.providerOptions;
  const workspaceWrite = z
    .object({ writable_roots: z.array(z.string()).optional() })
    .passthrough()
    .optional()
    .parse(options?.sandbox_workspace_write);
  const configured = await readWritableRoots({
    cwd,
    signal,
    env: { ...process.env, ...request.env },
  });
  return {
    ...request,
    config: {
      ...request.config,
      providerOptions: {
        ...options,
        sandbox_workspace_write: {
          ...workspaceWrite,
          writable_roots: [
            ...new Set([...configured, ...(workspaceWrite?.writable_roots ?? []), ...roots]),
          ],
        },
      },
    },
  };
}

async function resolveBaseRevision(
  jjRoot: string,
  signal: AbortSignal,
  base: string,
): Promise<string> {
  const gitRoot = await jj(jjRoot, signal, "git", "root", "--ignore-working-copy");
  const refs = base.startsWith("refs/")
    ? [base]
    : [`refs/heads/${base}`, `refs/remotes/${base}`, `refs/remotes/origin/${base}`];
  for (const ref of refs) {
    signal.throwIfAborted();
    try {
      const { stdout } = await execFileAsync(
        "git",
        [
          "--git-dir",
          gitRoot,
          "rev-parse",
          "--verify",
          "--quiet",
          "--end-of-options",
          `${ref}^{commit}`,
        ],
        { cwd: jjRoot, signal, timeout: 25_000, maxBuffer: 1024 * 1024 },
      );
      return stdout.trim();
    } catch (error) {
      if (!hasCode(error, 1)) throw error;
    }
  }
  throw new Error(
    `Git base branch ${JSON.stringify(base)} was not found locally. Fetch or create it before creating the workspace.`,
  );
}

async function reserveDirectory(
  root: string,
  projectName: string,
  existingNames: Set<string>,
  generateName: () => string,
) {
  for (let attempt = 0; attempt < 32; attempt++) {
    const name = generateName();
    if (existingNames.has(name)) continue;
    const directory = join(root, `${projectName}-${name}`);
    try {
      await mkdir(directory);
      return { name, directory };
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
  }
  throw new Error("Could not find an unused jj workspace name after 32 attempts.");
}

export async function createWorkspace({
  request,
  signal,
  listProjects,
  workspacesRoot = defaultWorkspacesRoot(),
  generateName = createNameId,
  writeMarker = writeFile,
}: CreateWorkspaceOptions): Promise<WorkspaceRequest> {
  signal.throwIfAborted();
  const source = request.source;
  let sourcePath = source.kind === "directory" ? source.path : source.cwd;
  async function getProject() {
    if (!source.projectId) return undefined;
    const { projects } = await listProjects();
    const project = projects.find((candidate) => candidate.projectId === source.projectId);
    if (!project) throw new Error(`Unknown Paseo project: ${source.projectId}`);
    return project;
  }
  // Project-only worktree requests have no cwd; resolve it through the public SDK.
  let project = sourcePath ? undefined : await getProject();
  sourcePath ??= project?.projectRootPath;
  if (!sourcePath) return request;

  const cwd = await realpath(expandHome(sourcePath));
  const jjRoot = await findJjRoot(cwd);
  if (!jjRoot) return request;
  project ??= await getProject();

  if (
    source.kind === "worktree" &&
    (source.action === "checkout" || source.checkoutSource || source.githubPrNumber !== undefined)
  ) {
    throw new Error(
      "paseo-jj-companion cannot check out Git branches or pull requests; create a new workspace instead.",
    );
  }

  if (source.kind === "worktree" && source.branchName) {
    console.info(
      "paseo-jj-companion creates a jj workspace without creating a new Git branch or jj bookmark.",
    );
  }

  const base =
    source.kind === "worktree" ? source.refName?.trim() || source.baseBranch?.trim() : undefined;
  const revision = base ? await resolveBaseRevision(jjRoot, signal, base) : undefined;

  const projectName =
    basename(project?.projectRootPath ?? jjRoot)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 100) || "project";
  const existingNames = new Set(
    (
      await jj(jjRoot, signal, "workspace", "list", "--ignore-working-copy", "-T", 'name ++ "\\n"')
    ).split("\n"),
  );
  signal.throwIfAborted();
  await mkdir(workspacesRoot, { recursive: true });
  const root = await realpath(workspacesRoot);
  const { name, directory } = await reserveDirectory(
    root,
    projectName,
    existingNames,
    generateName,
  );
  try {
    await jj(
      jjRoot,
      signal,
      "workspace",
      "add",
      "--name",
      name,
      ...(revision ? ["-r", revision] : []),
      directory,
    );
  } catch (error) {
    // Remove only our empty reservation. Leave partially created workspaces for inspection.
    await rmdir(directory).catch((cleanupError: unknown) => {
      if (!hasCode(cleanupError, "ENOENT") && !hasCode(cleanupError, "ENOTEMPTY")) {
        console.error(`paseo-jj-companion could not release ${directory}`, cleanupError);
      }
    });
    throw error;
  }
  try {
    await writeMarker(
      join(directory, ".jj", markerName),
      JSON.stringify({ version: 1, name, directory, sourceDirectory: jjRoot }),
      { flag: "wx", signal },
    );
    signal.throwIfAborted();
  } catch (error) {
    // This hook has not handed the directory to Paseo yet. A separate, bounded
    // signal permits rollback even when the creation invocation was canceled.
    try {
      await jj(directory, AbortSignal.timeout(4_000), "workspace", "remove", name);
    } catch (cleanupError) {
      console.error(
        `paseo-jj-companion failed to roll back ${directory}; remove jj workspace ${name} manually.`,
        cleanupError,
      );
    }
    throw error;
  }
  await runWorktreeLifecycle({
    phase: "setup",
    directory,
    name,
    sourceDirectory: jjRoot,
    signal,
  });
  console.info(`paseo-jj-companion created ${directory}`);

  return {
    ...request,
    // An explicit title keeps Paseo's task auto-naming from replacing the jj name.
    title: name,
    source: {
      kind: "directory",
      path: join(directory, relative(jjRoot, cwd)),
      ...(source.projectId ? { projectId: source.projectId } : {}),
    },
  };
}

function contains(directory: string, path: string): boolean {
  const child = relative(directory, path);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

async function archiveWorkspaceDirectory({
  workspace,
  signal,
  listWorkspaces,
  workspacesRoot = defaultWorkspacesRoot(),
}: ArchiveWorkspaceOptions): Promise<void> {
  signal.throwIfAborted();
  if (!workspace.archivedAt) return;
  const cwd = await resolveWorkspacePath(workspace.cwd);
  const jjRoot = await findJjRoot(cwd);
  if (!jjRoot) return;
  const directory = await realpath(jjRoot);
  const root = await optionalRealpath(workspacesRoot);
  if (!root || dirname(directory) !== root) return;

  let contents: string | undefined;
  for (const name of [markerName, legacyMarkerName]) {
    try {
      contents = await readFile(join(directory, ".jj", name), "utf8");
      break;
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
  if (contents === undefined) return;
  const ownership = ownershipSchema.parse(JSON.parse(contents));
  // Existing markers use the full directory name; new ones use the short jj name.
  // The registered workspace root is also checked below before removing anything.
  const directoryName = basename(directory);
  if (
    ownership.directory !== directory ||
    (ownership.name !== directoryName && !directoryName.endsWith(`-${ownership.name}`))
  ) {
    throw new Error(
      `paseo-jj-companion ownership does not match ${directory}; leaving it untouched.`,
    );
  }

  let cursor: string | undefined;
  do {
    signal.throwIfAborted();
    const page = await listWorkspaces({
      includeBackground: true,
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const entry of page.entries) {
      const path = await resolveWorkspacePath(entry.workspaceDirectory);
      if (contains(directory, path)) return;
    }
    if (page.pageInfo.hasMore && !page.pageInfo.nextCursor) {
      throw new Error("Paseo returned an incomplete workspace listing; skipping jj cleanup.");
    }
    cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
  } while (cursor);

  const registeredRoot = await jj(
    directory,
    signal,
    "workspace",
    "root",
    "--ignore-working-copy",
    "--name",
    ownership.name,
  );
  if ((await realpath(registeredRoot)) !== directory) {
    throw new Error(`jj workspace ${ownership.name} points elsewhere; skipping cleanup.`);
  }
  await runWorktreeLifecycle({
    phase: "teardown",
    directory,
    name: ownership.name,
    sourceDirectory: ownership.sourceDirectory,
    signal,
  });
  await jj(directory, signal, "workspace", "remove", ownership.name);
  console.info(`paseo-jj-companion removed ${directory}`);
}

// Archive events can overlap, including several records sharing one directory.
let archiveTail = Promise.resolve();
export function archiveWorkspace(options: ArchiveWorkspaceOptions): Promise<void> {
  const result = archiveTail.then(() => archiveWorkspaceDirectory(options));
  archiveTail = result.catch(() => {});
  return result;
}
