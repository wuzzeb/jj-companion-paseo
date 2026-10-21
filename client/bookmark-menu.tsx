import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { Bookmark } from "../shared/bookmarks.js";
import { bindBookmarkMenu } from "./web.js";

export interface BookmarkMenuTarget {
  bookmark: Bookmark;
  trigger: View;
  anchor: { x: number; y: number; width: number; height: number };
  bounds: { width: number; height: number };
}

export function BookmarkMenu({
  target,
  theme,
  remotes,
  busy,
  close,
  push,
}: {
  target: BookmarkMenuTarget;
  theme: PluginTheme;
  remotes: string[];
  busy: boolean;
  close(): void;
  push(remote: string): void;
}) {
  const ref = useRef<View>(null);
  const [activeRemote, setActiveRemote] = useState<string | null>(null);
  useEffect(() => bindBookmarkMenu(ref.current, target.trigger, close), [target, close]);
  const width = Math.min(240, Math.max(0, target.bounds.width - 16));
  const height = 36 + Math.max(remotes.length, 1) * 36 + (target.bookmark.conflict ? 42 : 0);
  const left = Math.max(8, Math.min(target.anchor.x, target.bounds.width - width - 8));
  const below = target.anchor.y + target.anchor.height + 4;
  const top = Math.max(
    8,
    below + height <= target.bounds.height - 8 ? below : target.anchor.y - height - 4,
  );
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000 }}
    >
      <Pressable
        accessible={false}
        tabIndex={-1}
        onPress={close}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        ref={ref}
        accessibilityRole="menu"
        accessibilityLabel={`Bookmark ${target.bookmark.name}`}
        onAccessibilityEscape={close}
        tabIndex={-1}
        testID="jj-bookmark-menu"
        style={{
          position: "absolute",
          left,
          top,
          width,
          padding: 4,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 6,
          backgroundColor: theme.colors.surface0,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.foregroundMuted, fontSize: 11, padding: 7 }}
        >
          {target.bookmark.name}
        </Text>
        {target.bookmark.conflict ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11, padding: 7 }}>
            Resolve this bookmark’s conflict in jj before pushing.
          </Text>
        ) : null}
        {remotes.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 8 }}>
            No Git remotes configured.
          </Text>
        ) : (
          remotes.map((remote) => (
            <Pressable
              key={remote}
              accessibilityRole="menuitem"
              accessibilityLabel={`Push to ${remote}`}
              accessibilityState={{ disabled: busy || target.bookmark.conflict }}
              disabled={busy || target.bookmark.conflict}
              onPress={() => push(remote)}
              onHoverIn={() => setActiveRemote(remote)}
              onHoverOut={() => setActiveRemote(null)}
              onFocus={() => setActiveRemote(remote)}
              onBlur={() => setActiveRemote(null)}
              style={({ pressed }) => ({
                minHeight: 36,
                justifyContent: "center",
                paddingHorizontal: 8,
                borderRadius: 4,
                backgroundColor:
                  pressed || activeRemote === remote ? theme.colors.surface2 : "transparent",
                opacity: busy || target.bookmark.conflict ? 0.45 : 1,
              })}
            >
              <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12 }}>
                Push to {remote}
              </Text>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}
