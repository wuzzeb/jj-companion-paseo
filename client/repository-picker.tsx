import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import type { Repository } from "../shared/repositories.js";
import { bindMenu } from "./web.js";

export function RepositoryPicker({
  repositories,
  value,
  theme,
  onSelect,
}: {
  readonly repositories: ReadonlyArray<Repository>;
  readonly value: string;
  readonly theme: PluginTheme;
  onSelect(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const menu = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(
    () => (open ? bindMenu(menu.current, trigger.current, close) : undefined),
    [open, close],
  );
  const { colors } = theme;
  const label = repositories.find((entry) => entry.id === value)?.label;
  const options = (
    <>
      {repositories.map((repository) => (
        <Pressable
          key={repository.id}
          accessibilityRole="menuitem"
          accessibilityState={{ selected: repository.id === value }}
          onPress={() => {
            close();
            onSelect(repository.id);
          }}
          style={({ pressed }) => ({
            padding: 8,
            flexDirection: "row",
            gap: 5,
            backgroundColor: pressed ? colors.surface2 : "transparent",
          })}
        >
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 11, flex: 1 }}>
            {repository.label}
          </Text>
          {repository.id === value ? (
            <Icon name="Check" size={12} color={colors.foreground} />
          ) : null}
        </Pressable>
      ))}
    </>
  );
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Pressable
        ref={trigger}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`Choose jj repository: ${label}`}
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          padding: 6,
          borderRadius: 4,
          backgroundColor: colors.surface1,
        }}
        testID="jj-repository-picker"
      >
        <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 11 }}>
          {label}
        </Text>
        <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
      </Pressable>
      {open && Platform.OS === "web" ? (
        <View
          ref={menu}
          accessibilityRole="menu"
          accessibilityLabel="jj repositories"
          onAccessibilityEscape={close}
          tabIndex={-1}
          style={{
            position: "absolute",
            top: 32,
            left: 0,
            right: 0,
            padding: 4,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 5,
            backgroundColor: colors.surface0,
            zIndex: 1000,
          }}
        >
          <ScrollView style={{ maxHeight: 280 }}>{options}</ScrollView>
        </View>
      ) : null}
      {Platform.OS !== "web" ? (
        <Modal title="jj repository" open={open} onOpenChange={setOpen}>
          <Modal.Content>{options}</Modal.Content>
        </Modal>
      ) : null}
    </View>
  );
}
