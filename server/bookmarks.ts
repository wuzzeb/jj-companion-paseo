import { z } from "zod";
import {
  bookmarkStateSchema,
  bookmarkSchema,
  revisionSchema,
  type BookmarkAction,
  type BookmarkState,
  type BookmarkTarget,
} from "../shared/bookmarks.js";
import { jsonLines, runJj } from "./jj.js";

const revisionTemplate =
  'json({"commitId" => commit_id, "changeId" => change_id, "parents" => parents.map(|p| p.commit_id()), "empty" => empty}) ++ "\\n"';
const commitSchema = revisionSchema.extend({ parents: z.array(z.string()), empty: z.boolean() });
const bookmarkTemplate =
  'json({"name" => name, "remote" => remote, "tracked" => tracked, "conflict" => conflict, "targets" => added_targets.map(|c| c.commit_id())}) ++ "\\n"';

async function revisions(root: string, revset: string, operation = "@", signal?: AbortSignal) {
  return z.array(commitSchema).parse(
    jsonLines(
      await runJj(root, ["log", "--no-graph", "-r", revset, "-T", revisionTemplate], {
        operation,
        signal,
      }),
    ),
  );
}

export async function readBookmarkState(
  root: string,
  signal?: AbortSignal,
): Promise<BookmarkState> {
  const operation = (
    await runJj(root, ["op", "log", "--no-graph", "-n", "1", "-T", "id"], { signal })
  ).trim();
  const [workingCopy] = await revisions(root, "@", operation, signal);
  if (!workingCopy) throw new Error("This workspace has no working-copy change.");
  // Empty merge commits still carry a meaningful choice of parents; keep those at @.
  const usesParent = workingCopy.empty && workingCopy.parents.length === 1;
  const [target] = usesParent
    ? await revisions(root, workingCopy.parents[0], operation, signal)
    : [workingCopy];
  const bookmarks = z.array(bookmarkSchema).parse(
    jsonLines(
      await runJj(root, ["bookmark", "list", "--all-remotes", "-T", bookmarkTemplate], {
        operation,
        signal,
      }),
    ),
  );
  const nearest = new Set(
    (
      await revisions(
        root,
        `heads((::${target.commitId} & bookmarks()) ~ (immutable() | trunk()))`,
        operation,
        signal,
      )
    ).map((entry) => entry.commitId),
  );
  const candidates = bookmarks
    .filter(
      (bookmark) => bookmark.remote === null && bookmark.targets.some((id) => nearest.has(id)),
    )
    .map((bookmark) => bookmark.name);
  const remoteOutput = await runJj(root, ["git", "remote", "list"], { operation, signal });
  const remotes = remoteOutput
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.split(/\s/)[0]);
  return bookmarkStateSchema.parse({
    bookmarks,
    remotes,
    workingCopy,
    target,
    usesParent,
    candidates,
  });
}

function local(state: BookmarkState, name: string, expected?: string[]) {
  const bookmark = state.bookmarks.find((entry) => entry.remote === null && entry.name === name);
  if (!bookmark) throw new Error(`Bookmark “${name}” no longer exists. Refresh history.`);
  if (expected && [...bookmark.targets].sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`Bookmark “${name}” moved since it was displayed. Refresh and try again.`);
  }
  return bookmark;
}

function workspaceBookmark(state: BookmarkState, name?: string) {
  if (name && !state.candidates.includes(name))
    throw new Error(`“${name}” is no longer a bookmark on this branch. Refresh history.`);
  if (!name && state.candidates.length === 0)
    throw new Error("No branch bookmark found. Create one first.");
  if (!name && state.candidates.length > 1)
    throw new Error(
      `More than one branch bookmark found: ${state.candidates.join(", ")}. Choose one explicitly.`,
    );
  const bookmark = local(state, name ?? state.candidates[0]);
  if (bookmark.conflict)
    throw new Error(
      `Bookmark “${bookmark.name}” is conflicted. Move it explicitly to resolve it first.`,
    );
  return bookmark;
}

function requireRemote(state: BookmarkState, remote: string | undefined): asserts remote is string {
  if (!remote || !state.remotes.includes(remote))
    throw new Error("Choose an available Git remote first.");
}

export async function runBookmarkAction(
  root: string,
  action: BookmarkAction,
  signal?: AbortSignal,
) {
  const before = await readBookmarkState(root, signal);
  const workspaceId =
    "workingCopyChangeId" in action
      ? action.workingCopyChangeId
      : "target" in action && action.target.kind === "workspace"
        ? action.target.workingCopyChangeId
        : action.kind === "push" && action.subject.kind === "workspace"
          ? action.subject.workingCopyChangeId
          : null;
  if (workspaceId && before.workingCopy.changeId !== workspaceId)
    throw new Error("The workspace is editing a different change. Refresh and try again.");
  if ("expectedTargets" in action) local(before, action.name, action.expectedTargets);
  if (action.kind === "push" && action.subject.kind === "bookmark")
    local(before, action.subject.name, action.subject.expectedTargets);
  if (action.kind === "push" && action.subject.kind === "workspace") {
    if (action.subject.bookmarkName)
      local(before, action.subject.bookmarkName, action.subject.expectedTargets);
    const bookmark = workspaceBookmark(before, action.subject.bookmarkName ?? undefined);
    if (bookmark.name !== action.subject.bookmarkName)
      throw new Error("The branch bookmark changed. Refresh and try again.");
  }
  if (action.kind === "create") {
    if (action.publish) requireRemote(before, action.remote);
  } else if ("remote" in action) requireRemote(before, action.remote);

  // A user action snapshots once, then uses the resulting concrete revisions for its commands.
  await runJj(root, ["util", "snapshot"], { readOnly: false, signal });
  const state = await readBookmarkState(root, signal);
  const mutate = (args: string[], network = false) =>
    runJj(root, ["--ignore-working-copy", ...args], { readOnly: false, signal, network });
  const push = async (name: string, remote: string) => {
    const current = await readBookmarkState(root, signal);
    const remoteBookmark = current.bookmarks.find(
      (entry) => entry.name === name && entry.remote === remote,
    );
    if (!remoteBookmark?.tracked) {
      const original = local(current, name);
      await mutate(["bookmark", "track", "--remote", `exact:${remote}`, "--", `exact:${name}`]);
      const tracked = local(await readBookmarkState(root, signal), name);
      if (tracked.conflict)
        throw new Error(
          `Now tracking ${name}@${remote}, but the bookmark is conflicted. Resolve its target before pushing.`,
        );
      if ([...tracked.targets].sort().join(",") !== [...original.targets].sort().join(",")) {
        throw new Error(
          `Tracking ${name}@${remote} changed the local bookmark’s position. Review it and push again.`,
        );
      }
    }
    await mutate(
      ["git", "push", "--remote", `exact:${remote}`, "--bookmark", `exact:${name}`],
      true,
    );
  };
  const resolveTarget = async (target: BookmarkTarget) => {
    if (target.kind === "workspace") return state.target.commitId;
    if (
      target.commitId === before.workingCopy.commitId &&
      target.changeId === before.workingCopy.changeId
    )
      return state.workingCopy.commitId;
    // Explicitly naming a hidden commit can make all() include it; anchor visibility to heads read separately.
    const heads = await revisions(root, "visible_heads()", "@", signal);
    const visible = heads.length
      ? `::(${heads.map((entry) => entry.commitId).join(" | ")})`
      : "none()";
    const [entry] = await revisions(root, `(${target.commitId}) & ${visible}`, "@", signal);
    if (!entry || entry.changeId !== target.changeId)
      throw new Error("The target change was rewritten or abandoned. Refresh history.");
    return entry.commitId;
  };
  switch (action.kind) {
    case "create": {
      if (
        state.bookmarks.some(
          (bookmark) => bookmark.remote === null && bookmark.name === action.name,
        )
      )
        throw new Error(`Bookmark “${action.name}” already exists.`);
      const to = await resolveTarget(action.target);
      await mutate(["bookmark", "create", "-r", to, "--", action.name]);
      if (action.publish) {
        requireRemote(state, action.remote);
        try {
          await push(action.name, action.remote);
        } catch (error) {
          throw new Error(
            `Created “${action.name}” locally, but push failed. ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return action.publish
        ? `Created and pushed “${action.name}” to ${action.remote}.`
        : `Created “${action.name}” locally. Its first push will track it automatically.`;
    }
    case "tug": {
      const bookmark = workspaceBookmark(state, action.name);
      await mutate([
        "bookmark",
        "move",
        "--to",
        state.target.commitId,
        "--",
        `exact:${bookmark.name}`,
      ]);
      return `Moved “${bookmark.name}” to ${state.target.changeId.slice(0, 8)}${state.usesParent ? " (@-)" : " (@)"}.`;
    }
    case "push": {
      const bookmark =
        action.subject.kind === "workspace"
          ? workspaceBookmark(state, action.subject.bookmarkName ?? undefined)
          : local(state, action.subject.name);
      if (action.subject.kind === "workspace" && bookmark.name !== action.subject.bookmarkName)
        throw new Error("The branch bookmark changed. Refresh and try again.");
      if (bookmark.conflict)
        throw new Error(`Bookmark “${bookmark.name}” is conflicted. Resolve it before pushing.`);
      await push(bookmark.name, action.remote);
      return `Pushed “${bookmark.name}” to ${action.remote}.`;
    }
    case "fetch":
      await mutate(["git", "fetch", "--remote", `exact:${action.remote}`], true);
      return `Fetched ${action.remote}.`;
    case "move":
      await mutate([
        "bookmark",
        "move",
        "--allow-backwards",
        "--to",
        await resolveTarget(action.target),
        "--",
        `exact:${action.name}`,
      ]);
      return `Moved “${action.name}”.`;
    case "rename":
      await mutate(["bookmark", "rename", "--", action.name, action.newName]);
      return `Renamed “${action.name}” to “${action.newName}”.`;
    case "delete":
      await mutate(["bookmark", "delete", "--", `exact:${action.name}`]);
      return `Deleted “${action.name}” locally. Remote deletion takes effect when you push it.`;
    case "track":
    case "untrack":
      await mutate([
        "bookmark",
        action.kind,
        "--remote",
        `exact:${action.remote}`,
        "--",
        `exact:${action.name}`,
      ]);
      return `${action.kind === "track" ? "Tracking" : "Untracked"} ${action.name}@${action.remote}.`;
  }
}
