import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { RpcInput } from "@getpaseo/plugin";
import { historyRpc, historySchema } from "../shared/history.js";
import { resolveRepository } from "./repository.js";
import { runJj } from "./jj.js";

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

export async function readHistory(cwd: string, limit: number, repository = ".") {
  const root = await resolveRepository(cwd, repository);
  if (!root) return historySchema.parse({ status: "not_jj" });

  // Pin the operation so observation neither snapshots files nor merges concurrent operations.
  const stdout = await runJj(root, [
    "log",
    // Flat log output bypasses jj's stack grouping and working-copy priority.
    '--config=ui.graph.style="ascii"',
    "--config=templates.log_node='\"\"'",
    "--config=ui.log-word-wrap=false",
    '--config=revsets.log-graph-prioritize="present(@)"',
    "-r",
    "all()",
    "-n",
    String(limit + 1),
    "-T",
    template,
  ]);
  // JSON strings escape embedded newlines, so each object occupies one graph row.
  // Discard graph-only connector rows and strip the ASCII prefix from data rows.
  const changes: ReadonlyArray<unknown> = stdout.split("\n").flatMap((line) => {
    const start = line.indexOf("{");
    return start < 0 ? [] : [JSON.parse(line.slice(start)) as unknown];
  });
  return historySchema.parse({
    status: "ready",
    root,
    changes: changes.slice(0, limit),
    hasMore: changes.length > limit,
  });
}

export async function listHistory(
  { workspaceId, limit, repository }: RpcInput<typeof historyRpc>,
  { paseo }: PluginHandlerContext,
) {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace) throw new Error("Workspace is unavailable.");
  return readHistory(workspace.workspaceDirectory, limit, repository);
}
