import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Change } from "../shared/history.js";
import type { Bookmark } from "../shared/bookmarks.js";
import { bindBookmarkDrop } from "./web.js";
import { rowHeight } from "./graph.js";

export function ChangeRow({
  change,
  active,
  children,
  theme,
  hostId,
  workspaceId,
  disabled,
  onSelect,
  onMove,
}: {
  change: Change;
  active: boolean;
  children: ReactNode;
  theme: PluginTheme;
  hostId: string;
  workspaceId: string;
  disabled: boolean;
  onSelect(): void;
  onMove(bookmark: Bookmark, target: Change): void;
}) {
  const ref = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (disabled) {
      setHovered(false);
      return;
    }
    return bindBookmarkDrop(
      ref.current,
      (drag) => {
        if (
          !disabled &&
          drag.hostId === hostId &&
          drag.workspaceId === workspaceId &&
          drag.bookmark?.remote === null
        )
          onMove(drag.bookmark, change);
      },
      setHovered,
    );
  }, [change, disabled, hostId, workspaceId, onMove]);
  const summary =
    change.description.split("\n")[0] ||
    (change.parents.length === 0 ? "root()" : "(no description)");
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`${change.isWorkingCopy ? "Working copy, " : ""}${summary}, ${change.changeId.slice(0, 8)}`}
      accessibilityState={{ selected: active }}
      onPress={onSelect}
      testID={`jj-change-${change.commitId}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        height: rowHeight,
        paddingRight: 12,
        backgroundColor: hovered || active || pressed ? theme.colors.surface2 : "transparent",
        borderRightWidth: hovered ? 3 : 0,
        borderRightColor: theme.colors.statusSuccess,
      })}
    >
      {children}
    </Pressable>
  );
}
