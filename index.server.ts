import type { PluginServerContext } from "@getpaseo/plugin/server";
import { archiveWorkspace, configureCodexAgent, createWorkspace } from "./server/workspaces.js";
import { listHistory } from "./server/history.js";
import { historyRpc } from "./shared/history.js";
import { bookmarkActionRpc, bookmarkOperationRpc, bookmarkStateRpc } from "./shared/bookmarks.js";
import { createBookmarkOperations } from "./server/bookmark-operations.js";

export default function contribute(server: PluginServerContext) {
  const bookmarks = createBookmarkOperations();
  server.handle(bookmarkStateRpc, bookmarks.state);
  server.handle(bookmarkActionRpc, bookmarks.start);
  server.handle(bookmarkOperationRpc, bookmarks.operation);
  server.handle(historyRpc, listHistory);
  server.before("agent.create", ({ request }, context) =>
    configureCodexAgent({ request, signal: context.signal }),
  );
  server.before("workspace.create", ({ request }, context) =>
    createWorkspace({
      request,
      signal: context.signal,
      listProjects: context.paseo.projects.list,
    }),
  );
  server.on("workspace.archived", ({ workspace }, context) =>
    archiveWorkspace({
      workspace,
      signal: context.signal,
      listWorkspaces: context.paseo.workspaces.list,
    }),
  );
  return () => bookmarks.dispose();
}
