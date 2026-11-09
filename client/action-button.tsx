import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";

export function ActionButton({
  label,
  accessibilityLabel = label,
  onPress,
  disabled = false,
  theme,
  loading = false,
}: {
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly theme: PluginTheme;
  readonly loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 9,
        paddingVertical: 7,
        borderRadius: 5,
        backgroundColor: theme.colors.surface1,
        opacity: (disabled && !loading) || pressed ? 0.45 : 1,
      })}
    >
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: 11,
          opacity: loading ? 0 : 1,
        }}
      >
        {label}
      </Text>
      {loading ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="small" color={theme.colors.foreground} />
        </View>
      ) : null}
    </Pressable>
  );
}
