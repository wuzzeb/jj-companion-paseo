import type { DiffCell, DiffView } from "../shared/review.js";

/** Convert aligned split rows to one column, with removals before additions in each edit. */
export function inlineDiff(view: DiffView): DiffView {
  const rows: DiffView["rows"][number][] = [];
  let removed: DiffCell[] = [];
  let added: DiffCell[] = [];
  const append = (cell: DiffCell) => rows.push({ cells: [cell], fullWidth: true });
  const flush = () => {
    removed.forEach(append);
    added.forEach(append);
    removed = [];
    added = [];
  };
  for (const row of view.rows) {
    if (row.fullWidth) {
      flush();
      rows.push(row);
      continue;
    }
    const [before, after] = row.cells;
    if (before.style === "removed" || after.style === "added") {
      if (before.style === "removed") removed.push({ ...before, newLine: null });
      if (after.style === "added")
        added.push({
          ...after,
          oldLine: null,
          newLine: typeof after.oldLine === "number" ? after.oldLine : null,
        });
    } else {
      flush();
      append({
        ...after,
        oldLine: before.oldLine,
        newLine: typeof after.oldLine === "number" ? after.oldLine : null,
      });
    }
  }
  flush();
  return { ...view, rows };
}
