import { useMutation } from "@tanstack/react-query";
import { ActivityIndicator, Pressable } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { reviewBranchRpc } from "../shared/review.js";

export function ReviewButton({
  theme,
  workspaceId,
  repository,
  disabled,
}: {
  readonly theme: PluginTheme;
  readonly workspaceId: string;
  readonly repository: string;
  readonly disabled: boolean;
}) {
  const open = useRpc(reviewBranchRpc);
  const toast = useToast();
  const review = useMutation({
    mutationFn: () => open({ workspaceId, repository }),
    onError: (error) => toast.error(error.message),
    onSuccess: (result) => {
      if (result.warning) toast.show(result.warning, { variant: "warning" });
    },
    retry: false,
  });
  const busy = review.isPending;
  return (
    <Pressable
      onPress={() => review.mutate()}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel="Review branch in Neovide"
      accessibilityState={{ disabled: disabled || busy, busy }}
      testID="jj-review-branch"
      style={({ pressed }) => ({
        width: 32,
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
    </Pressable>
  );
}
