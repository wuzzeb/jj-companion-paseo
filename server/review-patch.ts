import type { DiffCell, DiffView } from "../shared/review.js";

const cell = (text = "", line: number | string = "", style = "unchanged"): DiffCell => ({
  oldLine: line,
  newLine: null,
  style,
  spans: [{ text, style: "unchanged", token: "Plain", tooltip: null }],
  noEofNewline: false,
  anchor: null,
});

// jj does the text diff. Adapt a complete-context, single-file patch to JayJay's split rows.
export function patchToView(patch: string): DiffView {
  const rows: DiffView["rows"][number][] = [];
  let removed: DiffCell[] = [];
  let added: DiffCell[] = [];
  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++)
      rows.push({ cells: [removed[index] ?? cell(), added[index] ?? cell()], fullWidth: false });
    removed = [];
    added = [];
  };
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  let previous: { readonly side: "old" | "new" | "both"; readonly index: number } | null = null;
  for (const line of patch.split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      if (inHunk) throw new Error("Expected a complete-context diff with one hunk.");
      inHunk = true;
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      oldRemaining = header[2] === undefined ? 1 : Number(header[2]);
      newRemaining = header[4] === undefined ? 1 : Number(header[4]);
      if ((oldRemaining && oldLine !== 1) || (newRemaining && newLine !== 1))
        throw new Error("jj did not provide the complete file context.");
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("\\ ")) {
      if (!previous) throw new Error("Invalid end-of-file marker in jj diff.");
      if (previous.side === "old")
        removed[previous.index] = { ...removed[previous.index], noEofNewline: true };
      else if (previous.side === "new")
        added[previous.index] = { ...added[previous.index], noEofNewline: true };
      else
        rows[previous.index] = {
          ...rows[previous.index],
          cells: rows[previous.index].cells.map((entry) => ({ ...entry, noEofNewline: true })),
        };
      continue;
    }
    if (oldRemaining === 0 && newRemaining === 0) {
      if (line !== "") throw new Error("Unexpected content after the file diff.");
      continue;
    }
    if (line.startsWith("-")) {
      removed.push(cell(line.slice(1), oldLine++, "removed"));
      oldRemaining--;
      deletions++;
      previous = { side: "old", index: removed.length - 1 };
    } else if (line.startsWith("+")) {
      added.push(cell(line.slice(1), newLine++, "added"));
      newRemaining--;
      additions++;
      previous = { side: "new", index: added.length - 1 };
    } else if (line.startsWith(" ")) {
      flush();
      rows.push({
        cells: [
          cell(line.slice(1), oldLine++, "context"),
          cell(line.slice(1), newLine++, "context"),
        ],
        fullWidth: false,
      });
      oldRemaining--;
      newRemaining--;
      previous = { side: "both", index: rows.length - 1 };
    } else if (line === "") throw new Error("jj returned an incomplete file diff.");
    else throw new Error("Unexpected line in jj's Git-format diff.");
    if (oldRemaining < 0 || newRemaining < 0) throw new Error("Invalid line counts in jj diff.");
    if (rows.length + removed.length + added.length > 20_000)
      throw new Error(
        "This prototype displays at most 20,000 lines per file. Use an external viewer for this file.",
      );
  }
  if (oldRemaining !== 0 || newRemaining !== 0)
    throw new Error("jj returned an incomplete file diff.");
  flush();
  return {
    language: "text",
    added: additions,
    removed: deletions,
    whitespaceOnlyHidden: false,
    rows,
  };
}
