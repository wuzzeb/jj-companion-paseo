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

const execFileAsync = promisify(execFile);
const ownershipSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    directory: z.string().min(1),
  })
  .strict();
const markerName = "paseo-jj.json";
type WorkspaceRequest = PluginBeforeRequests["workspace.create"];
type ListWorkspaces = PluginHookContext["paseo"]["workspaces"]["list"];
type WorkspaceListResult = Awaited<ReturnType<ListWorkspaces>>;
type WorkspacePage = Pick<WorkspaceListResult, "pageInfo"> & {
  entries: Pick<WorkspaceListResult["entries"][number], "workspaceDirectory">[];
};
// Paseo 0.11.2 lists all active workspaces and has no background feature. Newer
// daemons need this option; their host-provided SDK forwards it to the daemon.
type WorkspaceListOptions = NonNullable<Parameters<ListWorkspaces>[0]> & {
  includeBackground: true;
};

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

async function findJjRoot(path: string): Promise<string | null> {
  let current = path;
  while (true) {
    try {
      if ((await stat(join(current, ".jj"))).isDirectory()) return current;
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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
    const name = `${projectName}-${generateName()}`;
    if (existingNames.has(name)) continue;
    const directory = join(root, name);
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
      "paseo-jj cannot check out Git branches or pull requests; create a new workspace instead.",
    );
  }

  if (source.kind === "worktree" && source.branchName) {
    console.info(
      "paseo-jj creates a jj workspace without creating a new Git branch or jj bookmark.",
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
        console.error(`paseo-jj could not release ${directory}`, cleanupError);
      }
    });
    throw error;
  }
  try {
    await writeMarker(
      join(directory, ".jj", markerName),
      JSON.stringify({ version: 1, name, directory }),
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
        `paseo-jj failed to roll back ${directory}; remove jj workspace ${name} manually.`,
        cleanupError,
      );
    }
    throw error;
  }
  console.info(`paseo-jj created ${directory}`);

  return {
    ...request,
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

  let contents: string;
  try {
    contents = await readFile(join(directory, ".jj", markerName), "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  const ownership = ownershipSchema.parse(JSON.parse(contents));
  if (ownership.directory !== directory || ownership.name !== basename(directory)) {
    throw new Error(`paseo-jj ownership does not match ${directory}; leaving it untouched.`);
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
  await jj(directory, signal, "workspace", "remove", ownership.name);
  console.info(`paseo-jj removed ${directory}`);
}

// Archive events can overlap, including several records sharing one directory.
let archiveTail = Promise.resolve();
export function archiveWorkspace(options: ArchiveWorkspaceOptions): Promise<void> {
  const result = archiveTail.then(() => archiveWorkspaceDirectory(options));
  archiveTail = result.catch(() => {});
  return result;
}
