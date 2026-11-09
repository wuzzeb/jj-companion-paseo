import { Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Bookmark } from "../shared/bookmarks.js";

export function BookmarkChip({
  bookmark,
  theme,
}: {
  readonly bookmark: Bookmark;
  readonly theme: PluginTheme;
}) {
  const label = `${bookmark.name}${bookmark.remote ? `@${bookmark.remote}` : ""}${bookmark.conflict ? "??" : ""}`;
  return (
    <View
      testID={`jj-bookmark-${label}`}
      style={{
        backgroundColor: theme.colors.surface1,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        maxWidth: 160,
        flexShrink: 1,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: bookmark.conflict ? theme.colors.statusDanger : theme.colors.foreground,
          fontSize: 10,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
