import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createReviewLauncher } from "./server/review.js";
import { reviewBranchRpc, reviewSelectionRpc } from "./shared/review.js";
import { repositoriesRpc } from "./shared/repositories.js";
import { listRepositories } from "./server/repository.js";
import { archiveWorkspace, configureCodexAgent, createWorkspace } from "./server/workspaces.js";
import { listHistory } from "./server/history.js";
import { historyRpc } from "./shared/history.js";
import { bookmarkActionRpc, bookmarkOperationRpc, bookmarkStateRpc } from "./shared/bookmarks.js";
import { createBookmarkOperations } from "./server/bookmark-operations.js";

export default function contribute(server: PluginServerContext) {
  const bookmarks = createBookmarkOperations();
  const review = createReviewLauncher();
  server.handle(reviewBranchRpc, review.branch);
  server.handle(reviewSelectionRpc, review.selection);
  server.handle(repositoriesRpc, async ({ workspaceId }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace) throw new Error("Workspace is unavailable.");
    return listRepositories(workspace.workspaceDirectory);
  });
  server.handle(bookmarkStateRpc, bookmarks.state);
  server.handle(bookmarkActionRpc, bookmarks.start);
  server.handle(bookmarkOperationRpc, bookmarks.operation);
  server.handle(historyRpc, listHistory);
  server.addHook("agent.create.before", ({ request }, context) =>
    configureCodexAgent({ request, signal: context.signal }),
  );
  server.addHook("workspace.create.before", ({ request }, context) =>
    createWorkspace({
      request,
      signal: context.signal,
      listProjects: context.paseo.projects.list,
    }),
  );
  server.addHook("workspace.archive.after", ({ workspace }, context) =>
    archiveWorkspace({
      workspace,
      signal: context.signal,
      listWorkspaces: context.paseo.workspaces.list,
    }),
  );
  return async () => {
    await Promise.all([bookmarks.dispose(), review.dispose()]);
  };
}
