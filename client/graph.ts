import type { Change } from "../shared/history.js";

export const rowHeight = 84;
export const nodeY = 20;
export const laneWidth = 16;
export const laneX = (lane: number) => 14 + lane * laneWidth;

export interface GraphLine {
  fromLane: number;
  toLane: number;
  fromY: number;
  toY: number;
  missing?: boolean;
}

export interface GraphRow {
  lane: number;
  lines: GraphLine[];
}

export function layoutGraph(changes: readonly Pick<Change, "commitId" | "parents">[]) {
  const positions = new Map(changes.map((change, index) => [change.commitId, index]));
  const lanes: (string | null)[] = [];
  let laneCount = 1;
  const allocate = (id: string) => {
    let lane = lanes.indexOf(null);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = id;
    laneCount = Math.max(laneCount, lane + 1);
    return lane;
  };

  const rows = changes.map((change, index): GraphRow => {
    const lines: GraphLine[] = [];
    let lane = lanes.indexOf(change.commitId);
    for (const [incomingLane, id] of lanes.entries()) {
      if (id === null) continue;
      lines.push({
        fromLane: incomingLane,
        toLane: incomingLane,
        fromY: 0,
        toY: incomingLane === lane ? nodeY : rowHeight,
      });
    }
    if (lane < 0) lane = allocate(change.commitId);
    lanes[lane] = null;

    for (const parent of new Set(change.parents)) {
      const position = positions.get(parent);
      if (position === undefined || position <= index) {
        lines.push({ fromLane: lane, toLane: lane, fromY: nodeY, toY: 52, missing: true });
        continue;
      }
      let parentLane = lanes.indexOf(parent);
      if (parentLane < 0) {
        if (lanes[lane] === null) {
          parentLane = lane;
          lanes[lane] = parent;
        } else {
          parentLane = allocate(parent);
        }
      }
      lines.push({ fromLane: lane, toLane: parentLane, fromY: nodeY, toY: rowHeight });
    }
    return { lane, lines };
  });

  return { rows, width: laneX(laneCount - 1) + 18 };
}

export function resolveSelection(
  changes: readonly Change[],
  selection: Pick<Change, "commitId" | "changeId"> | null,
): Change | null {
  if (!selection) return changes.find((change) => change.isWorkingCopy) ?? changes[0] ?? null;
  const exact = changes.find((change) => change.commitId === selection.commitId);
  if (exact) return exact;
  const rewritten = changes.filter((change) => change.changeId === selection.changeId);
  return rewritten.length === 1 ? rewritten[0] : null;
}
