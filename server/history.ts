import { realpath } from "node:fs/promises";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import { historyRpc, historySchema } from "../shared/history.js";
import { findJjRoot } from "./repository.js";
import { jsonLines, runJj } from "./jj.js";

const template = `json({
  "commitId" => commit_id,
  "changeId" => change_id,
  "parents" => parents.map(|p| p.commit_id()),
  "description" => description,
  "author" => author.name(),
  "timestamp" => author.timestamp().format("%Y-%m-%dT%H:%M:%S%:z"),
  "bookmarks" => bookmarks.map(|b| stringify(b.name() ++ if(b.remote(), "@" ++ b.remote(), "") ++ if(b.conflict(), "??", ""))),
  "workspaces" => working_copies.map(|w| w.name()),
  "isWorkingCopy" => current_working_copy,
  "isImmutable" => immutable,
  "isEmpty" => empty,
  "hasConflict" => conflict
}) ++ "\\n"`;

export async function readHistory(cwd: string, limit: number) {
  const root = await findJjRoot(await realpath(cwd));
  if (!root) return historySchema.parse({ status: "not_jj" });

  // Pin the operation so observation neither snapshots files nor merges concurrent operations.
  const stdout = await runJj(root, [
    "log",
    "--no-graph",
    "-r",
    "all()",
    "-n",
    String(limit + 1),
    "-T",
    template,
  ]);
  const changes = jsonLines(stdout);
  return historySchema.parse({
    status: "ready",
    root,
    changes: changes.slice(0, limit),
    hasMore: changes.length > limit,
  });
}

export async function listHistory(
  { workspaceId, limit }: RpcInput<typeof historyRpc>,
  { paseo }: PluginHandlerContext,
) {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace) throw new Error("Workspace is unavailable.");
  return readHistory(workspace.workspaceDirectory, limit);
}
