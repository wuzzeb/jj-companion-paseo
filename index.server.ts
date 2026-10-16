import type { PluginServerContext } from "@getpaseo/plugin/server";
import { archiveWorkspace, createWorkspace } from "./server/workspaces.js";

export default function contribute(server: PluginServerContext) {
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
  return () => {};
}
