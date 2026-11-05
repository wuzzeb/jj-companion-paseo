import { useMutation } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { reviewBranchRpc, reviewSelectionRpc, type ReviewSelection } from "../shared/review.js";

export function ReviewButton({
  theme,
  workspaceId,
  repository,
  disabled,
  selection = null,
}: {
  readonly theme: PluginTheme;
  readonly workspaceId: string;
  readonly repository: string;
  readonly disabled: boolean;
  readonly selection?: ReviewSelection | null;
}) {
  const open = useRpc(reviewBranchRpc);
  const openSelection = useRpc(reviewSelectionRpc);
  const toast = useToast();
  const review = useMutation({
    mutationFn: (selection: ReviewSelection | null) =>
      selection
        ? openSelection({ workspaceId, repository, selection })
        : open({ workspaceId, repository }),
    onError: (error) => toast.error(error.message),
    onSuccess: (result) => {
      if (result.warning) toast.show(result.warning, { variant: "warning" });
    },
    retry: false,
  });
  const busy = review.isPending;
  const label =
    selection?.kind === "range" ? "Review range" : selection ? "Review change" : "Review branch";
  return (
    <Pressable
      onPress={() => review.mutate(selection)}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={`${label} in Neovide`}
      accessibilityState={{ disabled: disabled || busy, busy }}
      testID={`jj-review-${selection?.kind ?? "branch"}`}
      style={({ pressed }) => ({
        ...(selection
          ? { paddingHorizontal: 8, gap: 6, flexDirection: "row" as const }
          : { width: 32 }),
        height: 32,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled || pressed ? 0.4 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
      ) : (
        <Icon name="ExternalLink" size={15} color={theme.colors.foregroundMuted} />
      )}
      {selection ? (
        <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}
