import type { PluginClientContext } from "@getpaseo/plugin/client";
import { JjWorkspacePicker } from "./client/jj-workspace-picker.js";
import { ReviewPanel } from "./client/review-panel.js";

export default function contribute(client: PluginClientContext) {
  client.addNewWorkspaceItem({ id: "jj-workspace", Component: JjWorkspacePicker });
  client.addWorkspacePanel({
    id: "review",
    title: "jj companion",
    icon: "GitCompareArrows",
    locations: ["workspace"],
    Component: ReviewPanel,
  });
  client.addCommandCenterItem({
    id: "open-review",
    title: "Open jj review",
    icon: "GitCompareArrows",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("review", { location: "workspace" });
    },
  });
  return () => {};
}
