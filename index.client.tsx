import type { PluginClientContext, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { HistoryPanel } from "./client/history-panel.js";
import { ReviewPanel } from "./client/review-panel.js";
import { createReviewNavigation } from "./client/review-navigation.js";

export default function contribute(client: PluginClientContext) {
  const navigation = createReviewNavigation((workspaceId) =>
    client.openPanel("review", { workspaceId, location: "workspace" }),
  );
  const Review = (props: PluginWorkspacePanelProps) => (
    <ReviewPanel {...props} reviewNavigation={navigation} />
  );
  const History = (props: PluginWorkspacePanelProps) => (
    <HistoryPanel
      {...props}
      openReview={(repository, target) =>
        navigation.open(props.host.id, props.workspaceId, repository, target)
      }
    />
  );
  client.addWorkspacePanel({
    id: "review",
    title: "jj Review",
    icon: "GitCompareArrows",
    locations: ["workspace"],
    Component: Review,
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
    Component: History,
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
  return () => navigation.dispose();
}
