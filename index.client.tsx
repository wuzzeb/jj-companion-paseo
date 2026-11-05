import type { PluginClientContext } from "@getpaseo/plugin/client";
import { HistoryPanel } from "./client/history-panel.js";
import { ReviewPanel } from "./client/review-panel.js";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "review",
    title: "jj Review",
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
  client.addWorkspacePanel({
    id: "history",
    title: "jj Companion",
    icon: "GitGraph",
    locations: ["explorer", "workspace"],
    Component: HistoryPanel,
  });
  client.addCommandCenterItem({
    id: "open-history",
    title: "Open jj history",
    icon: "GitGraph",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("history", { location: "explorer" });
    },
  });
  return () => {};
}
