import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Bookmark } from "../shared/bookmarks.js";
import { bindBookmark } from "./web.js";

export function BookmarkChip({
  bookmark,
  hostId,
  workspaceId,
  theme,
  disabled,
  onOpen,
}: {
  bookmark: Bookmark;
  hostId: string;
  workspaceId: string;
  theme: PluginTheme;
  disabled: boolean;
  onOpen(bookmark: Bookmark, anchor: View | null): void;
}) {
  const ref = useRef<View>(null);
  const dragging = useRef(false);
  const suppressClickUntil = useRef(0);
  const open = () => {
    if (!dragging.current && Date.now() >= suppressClickUntil.current)
      onOpen(bookmark, ref.current);
  };
  useEffect(() => {
    if (disabled || bookmark.remote !== null) return;
    return bindBookmark(
      ref.current,
      { hostId, workspaceId, bookmark },
      () => {
        if (!dragging.current && Date.now() >= suppressClickUntil.current)
          onOpen(bookmark, ref.current);
      },
      (value) => {
        if (dragging.current && !value) suppressClickUntil.current = Date.now() + 200;
        dragging.current = value;
      },
    );
  }, [bookmark, disabled, hostId, workspaceId, onOpen]);
  const label = `${bookmark.name}${bookmark.remote ? `@${bookmark.remote}` : ""}${bookmark.conflict ? "??" : ""}`;
  const style = {
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 160,
  };
  const content = (
    <Text
      numberOfLines={1}
      style={{
        color: bookmark.conflict ? theme.colors.statusDanger : theme.colors.foreground,
        fontSize: 10,
      }}
    >
      {label}
    </Text>
  );
  if (bookmark.remote !== null)
    return (
      <View style={style} testID={`jj-bookmark-${label}`}>
        {content}
      </View>
    );
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      onPress={(event) => {
        event.stopPropagation();
        open();
      }}
      onLongPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Bookmark ${label}`}
      accessibilityHint="Open to push this bookmark."
      testID={`jj-bookmark-${label}`}
      style={style}
    >
      {content}
    </Pressable>
  );
}
