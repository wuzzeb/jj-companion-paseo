import type { PluginClientContext } from "@getpaseo/plugin/client";
import { HistoryPanel } from "./client/history-panel.js";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "history",
    title: "jj",
    icon: "GitGraph",
    context: "workspace",
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
