import type { ReactNode } from "react";
import { Pressable } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Change } from "../shared/history.js";
import { rowHeight } from "./graph.js";

export function ChangeRow({
  change,
  active,
  children,
  theme,
  onSelect,
}: {
  readonly change: Change;
  readonly active: boolean;
  readonly children: ReactNode;
  readonly theme: PluginTheme;
  readonly onSelect: (extend: boolean) => void;
}) {
  const summary =
    change.description.split("\n")[0] ||
    (change.parents.length === 0 ? "root()" : "(no description)");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${change.isWorkingCopy ? "Working copy, " : ""}${summary}, ${change.changeId.slice(0, 8)}`}
      accessibilityState={{ selected: active }}
      onPress={(event) =>
        onSelect("shiftKey" in event.nativeEvent && event.nativeEvent.shiftKey === true)
      }
      testID={`jj-change-${change.commitId}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        height: rowHeight,
        paddingRight: 12,
        backgroundColor: active || pressed ? theme.colors.surface2 : "transparent",
      })}
    >
      {children}
    </Pressable>
  );
}
