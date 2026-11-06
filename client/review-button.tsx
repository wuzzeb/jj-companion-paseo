import { Pressable, Text } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReviewTarget } from "../shared/review.js";

export function ReviewButton({
  theme,
  target,
  open,
  disabled,
  iconOnly = false,
}: {
  readonly theme: PluginTheme;
  readonly target: ReviewTarget;
  readonly open: (target: ReviewTarget) => void;
  readonly disabled: boolean;
  readonly iconOnly?: boolean;
}) {
  const label =
    target.kind === "branch"
      ? "Review branch"
      : target.kind === "selection" && target.end
        ? "Review range"
        : "Review change";
  return (
    <Pressable
      onPress={() => open(target)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} in review tab`}
      accessibilityState={{ disabled }}
      testID={`jj-review-${target.kind === "branch" ? "branch" : target.kind === "selection" && target.end ? "range" : "change"}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 32,
        ...(iconOnly ? { width: 32 } : { paddingHorizontal: 8, gap: 6 }),
        opacity: disabled || pressed ? 0.4 : 1,
      })}
    >
      <Icon name="GitCompareArrows" size={15} color={theme.colors.foregroundMuted} />
      {!iconOnly ? (
        <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}
