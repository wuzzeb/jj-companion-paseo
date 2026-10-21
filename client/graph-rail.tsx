import type { PluginTheme } from "@getpaseo/plugin";
import { View } from "react-native";
import type { Change } from "../shared/history.js";
import { laneX, nodeY, rowHeight, type GraphRow } from "./graph.js";

export function GraphRail({
  row,
  width,
  change,
  theme,
}: {
  row: GraphRow;
  width: number;
  change: Change;
  theme: PluginTheme;
}) {
  const color = change.hasConflict
    ? theme.colors.statusDanger
    : change.isImmutable
      ? theme.colors.foregroundMuted
      : theme.colors.statusSuccess;
  return (
    <View style={{ width, height: rowHeight }} pointerEvents="none" aria-hidden>
      {row.lines.map((line, index) => {
        const x1 = laneX(line.fromLane);
        const x2 = laneX(line.toLane);
        const height = line.toY - line.fromY;
        const length = Math.hypot(x2 - x1, height);
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              left: (x1 + x2) / 2 - 0.75,
              top: (line.fromY + line.toY) / 2 - length / 2,
              width: 1.5,
              height: length,
              backgroundColor: theme.colors.foregroundMuted,
              opacity: line.missing ? 0.3 : 0.65,
              transform: [{ rotate: `${-Math.atan2(x2 - x1, height)}rad` }],
            }}
          />
        );
      })}
      {row.lines.some((line) => line.missing) ? (
        <View
          style={{
            position: "absolute",
            left: laneX(row.lane) - 2,
            top: 51,
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.foregroundMuted,
          }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          left: laneX(row.lane) - (change.isWorkingCopy ? 5 : 3.5),
          top: nodeY - (change.isWorkingCopy ? 5 : 3.5),
          width: change.isWorkingCopy ? 10 : 7,
          height: change.isWorkingCopy ? 10 : 7,
          borderRadius: change.isImmutable ? 1 : 10,
          borderWidth: change.isWorkingCopy || change.isImmutable ? 1.5 : 0,
          borderColor: color,
          backgroundColor:
            change.isWorkingCopy || change.isImmutable ? theme.colors.surface0 : color,
          transform: change.isImmutable ? [{ rotate: "45deg" }] : [],
        }}
      />
    </View>
  );
}
