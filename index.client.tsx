import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReviewPanel } from "./client/review-panel.js";

export default function contribute(client: PluginClientContext) {
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
