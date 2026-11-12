import { useEffect, useState } from "react";
import type { DiffView } from "../shared/review.js";
import { DiffPane } from "./vendor/jayjay/components/diff/DiffPane.js";
import { diffCss } from "./vendor/jayjay/styles.js";
import type { HighlightStyle } from "@getpaseo/highlight";

// Unistyles exposes the live syntax palette on the document root. Older hosts
// without these variables use the plugin's semantic theme colors instead.
const syntaxFallbacks = {
  keyword: "--jj-accent",
  comment: "--jj-muted",
  string: "--jj-added-ink",
  number: "--jj-accent",
  literal: "--jj-accent",
  function: "--jj-accent",
  definition: "--jj-ink",
  class: "--jj-accent",
  type: "--jj-accent",
  tag: "--jj-accent",
  attribute: "--jj-accent",
  property: "--jj-ink",
  variable: "--jj-ink",
  operator: "--jj-ink",
  punctuation: "--jj-ink",
  regexp: "--jj-added-ink",
  escape: "--jj-accent",
  meta: "--jj-muted",
  heading: "--jj-accent",
  link: "--jj-accent",
} as const satisfies Readonly<Record<HighlightStyle, string>>;

const labels = {
  before: "Before",
  after: "After",
  added: "Added",
  removed: "Removed",
  eof: "No newline at end of file",
  empty: "No textual changes",
  showAll: "Show all",
};

// Keep JayJay's DOM, styles and theme contract inside this presentation adapter.
const rendererCss = `
.paseo-jj-review .jayjay-review {
  --jj-page:var(--review-page);
  --jj-surface:var(--review-surface);
  --jj-ink:var(--review-ink);
  --jj-muted:var(--review-muted);
  --jj-border:var(--review-border);
  --jj-accent:var(--review-accent);
  --jj-added-ink:var(--review-added-ink);
  --jj-removed-ink:var(--review-removed-ink);
  --jj-mono:var(--review-mono);
  --jj-added-bg:color-mix(in srgb, var(--review-added-ink) 12%, var(--review-page));
  --jj-removed-bg:color-mix(in srgb, var(--review-removed-ink) 12%, var(--review-page));
}
.paseo-jj-review .jj-split-head { font-family:var(--paseo-ui-font, system-ui); }
.paseo-jj-review .jj-line-number { flex-basis:50px; }
.paseo-jj-review .jj-diff-cell code { user-select:text; }
.paseo-jj-review .jayjay-review[data-diff-layout=split][data-copy-side=old] .jj-diff-cell:nth-child(2) code,
.paseo-jj-review .jayjay-review[data-diff-layout=split][data-copy-side=new] .jj-diff-cell:first-child code { user-select:none; }
${Object.entries(syntaxFallbacks)
  .map(
    ([role, fallback]) =>
      `.paseo-jj-review .jj-token-paseo-${role} { color:var(--colors-syntax-${role}, var(${fallback})); }`,
  )
  .join("\n")}
`;

export function JayJayDiff({
  view,
  split,
  showAll,
}: {
  readonly view: DiffView;
  readonly split: boolean;
  readonly showAll: () => void;
}) {
  const [copySide, setCopySide] = useState<"old" | "new" | null>(null);
  useEffect(() => setCopySide(null), [split]);
  return (
    <div
      className="review-code jayjay-review"
      data-pmono=""
      data-copy-side={copySide ?? undefined}
      data-diff-layout={split ? "split" : "inline"}
      onPointerDownCapture={(event) => {
        if (!split) return;
        const target =
          event.target instanceof Element ? event.target.closest(".jj-diff-cell") : null;
        const side = target ? (target.previousElementSibling ? "new" : "old") : null;
        // CSS alone cannot constrain an existing DOM selection to one column.
        if (side && side !== copySide)
          event.currentTarget.ownerDocument.getSelection()?.removeAllRanges();
        setCopySide(side);
      }}
    >
      <style>{diffCss + rendererCss}</style>
      <DiffPane view={view} split={split} showAll={showAll} labels={labels} />
    </div>
  );
}
