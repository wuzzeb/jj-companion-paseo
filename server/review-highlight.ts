import { setImmediate } from "node:timers/promises";
import { highlightCodeWithBudget, isLanguageSupported } from "@getpaseo/highlight";
import type { DiffCell, DiffView, ReviewFile } from "../shared/review.js";

/** Complete-context split rows contain both documents, including hidden context. */
export async function highlightReview(
  view: DiffView,
  file: Pick<ReviewFile, "path" | "oldPath">,
  signal?: AbortSignal,
): Promise<DiffView> {
  const highlightSide = async (side: number, path: string) => {
    if (!isLanguageSupported(path)) return null;
    // Empty alignment cells have no line number and must not enter the source.
    const source = view.rows.flatMap((row) => {
      const cell = row.cells[side];
      return typeof cell?.oldLine === "number"
        ? [cell.spans.map((span) => span.text).join("")]
        : [];
    });
    if (source.length === 0) return null;
    return highlightCodeWithBudget(source.join("\n"), path, {
      yieldToEventLoop: setImmediate,
      signal,
    });
  };
  const before = await highlightSide(0, file.oldPath);
  const after = await highlightSide(1, file.path);
  if (!before && !after) return view;
  const highlightCell = (cell: DiffCell, side: number): DiffCell => {
    const tokens =
      typeof cell.oldLine === "number"
        ? (side === 0 ? before : after)?.[cell.oldLine - 1]
        : undefined;
    return tokens
      ? {
          ...cell,
          spans: tokens.map(({ text, style }) => ({
            text,
            token: style ? `paseo-${style}` : "Plain",
            style: "unchanged",
            tooltip: null,
          })),
        }
      : cell;
  };
  return {
    ...view,
    rows: view.rows.map((row) => ({ ...row, cells: row.cells.map(highlightCell) })),
  };
}
