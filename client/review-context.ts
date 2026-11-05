import type { DiffCell, DiffView } from "../shared/review.js";

export function collapseContext(view: DiffView, context = 3): DiffView {
  const visible = new Set<number>();
  view.rows.forEach((row, index) => {
    if (!row.cells.some((cell) => cell.style === "added" || cell.style === "removed")) return;
    for (
      let next = Math.max(0, index - context);
      next <= Math.min(view.rows.length - 1, index + context);
      next++
    )
      visible.add(next);
  });
  if (visible.size === 0) return view;
  const rows: DiffView["rows"][number][] = [];
  let hidden = 0;
  const flush = () => {
    if (!hidden) return;
    const cell: DiffCell = {
      oldLine: "",
      newLine: null,
      style: "separator",
      spans: [
        { text: `${hidden} unchanged lines`, style: "unchanged", token: "Plain", tooltip: null },
      ],
      noEofNewline: false,
      anchor: null,
    };
    rows.push({ cells: [cell], fullWidth: true });
    hidden = 0;
  };
  view.rows.forEach((row, index) => {
    if (visible.has(index)) {
      flush();
      rows.push(row);
    } else hidden++;
  });
  flush();
  return { ...view, rows };
}
