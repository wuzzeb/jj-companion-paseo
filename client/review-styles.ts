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

export const reviewCss = `
.paseo-jj-review { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; height:100%; overflow:hidden; color:var(--jj-ink); background:var(--jj-page); font:12px/1.5 system-ui,sans-serif; }
.paseo-jj-review, .paseo-jj-review * { box-sizing:border-box; }
.paseo-jj-review .review-file:hover, .paseo-jj-review .review-directory > summary:hover { background:var(--review-hover); }
.paseo-jj-review :focus-visible { outline:2px solid var(--jj-accent); outline-offset:-2px; }
.paseo-jj-review .review-history-controls { display:flex; flex:1; align-items:center; justify-content:flex-end; gap:4px; min-width:0; }
.paseo-jj-review .review-repository-picker { flex:1; min-width:0; width:100%; padding:3px 5px; border:1px solid var(--jj-border); border-radius:4px; color:var(--jj-ink); background:var(--jj-surface); font:inherit; text-overflow:ellipsis; cursor:pointer; }
.paseo-jj-review .review-icon-button { display:inline-flex; flex:0 0 26px; align-items:center; justify-content:center; width:26px; height:26px; padding:0; border:0; border-radius:4px; color:var(--jj-muted); background:transparent; cursor:pointer; }
.paseo-jj-review .review-icon-button > span { display:inline-flex; }
.paseo-jj-review .review-icon-button:hover { background:var(--review-hover); color:var(--jj-ink); }
.paseo-jj-review .review-icon-button[aria-pressed=true] { color:var(--jj-accent); background:var(--jj-surface); }
.paseo-jj-review .review-icon-button[aria-busy=true] svg { animation:jj-review-spin 1s linear infinite; }
.paseo-jj-review button:disabled { cursor:default; opacity:.5; }
@keyframes jj-review-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .paseo-jj-review .review-icon-button[aria-busy=true] svg { animation:none; } }
.paseo-jj-review .jj-split-head { font-family:var(--paseo-ui-font, system-ui); }
.paseo-jj-review .review-layout { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-changes { display:flex; flex:0 0 320px; min-width:260px; overflow:hidden; border-right:1px solid var(--jj-border); }
.paseo-jj-review .review-document { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.paseo-jj-review .review-comparison-caption { flex-shrink:0; padding:8px 14px; border-bottom:1px solid var(--jj-border); color:var(--jj-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.paseo-jj-review .review-change-description { flex-shrink:0; max-height:180px; overflow:auto; padding:10px 14px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-change-description h2 { margin:0; font-size:14px; font-weight:600; overflow-wrap:anywhere; }
.paseo-jj-review .review-change-description p { margin:6px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.paseo-jj-review .review-change-meta { display:flex; flex-wrap:wrap; align-items:center; gap:5px 12px; margin-top:6px; color:var(--jj-muted); font-size:11px; }
.paseo-jj-review .review-change-meta code { font-family:var(--jj-mono); }
.paseo-jj-review .review-body { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-files { flex:0 0 200px; min-width:0; overflow:auto; border-right:1px solid var(--jj-border); padding:0; }
@media (max-width:1100px) {
  .paseo-jj-review .review-changes { flex-basis:260px; }
  .paseo-jj-review .review-files { flex-basis:160px; }
}
.paseo-jj-review .review-files-header { display:flex; align-items:center; gap:8px; height:36px; padding:0 8px; }
.paseo-jj-review .review-file-count { flex:1; min-width:0; color:var(--jj-muted); }
.paseo-jj-review .review-directory > summary { padding:7px 12px; overflow-wrap:anywhere; cursor:pointer; color:var(--jj-muted); }
.paseo-jj-review .review-tree-children { padding-left:12px; }
.paseo-jj-review .review-file { display:flex; gap:8px; width:100%; border:0; border-radius:0; padding:7px 12px; text-align:left; overflow-wrap:anywhere; background:transparent; color:inherit; font:inherit; cursor:pointer; }
.paseo-jj-review .review-file[aria-pressed=true] { background:var(--review-hover); box-shadow:inset 3px 0 var(--jj-accent); }
.paseo-jj-review .review-status { font:11px/1.7 var(--jj-mono); color:var(--jj-muted); }
.paseo-jj-review .review-file[data-status=A] .review-status { color:var(--jj-added-ink); }
.paseo-jj-review .review-file[data-status=D] .review-status { color:var(--jj-removed-ink); }
.paseo-jj-review .review-file-pane { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.paseo-jj-review .review-file-header { display:flex; align-items:center; gap:8px; min-height:36px; padding:5px 10px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-path { flex:1; min-width:0; overflow-wrap:anywhere; font-family:var(--jj-mono); }
.paseo-jj-review .review-stats { color:var(--jj-muted); white-space:nowrap; font-family:var(--jj-mono); }
.paseo-jj-review .review-stats-added { color:var(--jj-added-ink); }
.paseo-jj-review .review-stats-removed { color:var(--jj-removed-ink); }
.paseo-jj-review .review-code { flex:1; min-height:0; overflow:auto; }
.paseo-jj-review .review-message { padding:20px; color:var(--jj-muted); overflow-wrap:anywhere; }
.paseo-jj-review .review-error { color:var(--jj-removed-ink); }
.paseo-jj-review .review-notice { padding:9px 14px; color:var(--jj-muted); border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-refresh-error { padding:9px 14px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .jj-line-number { flex-basis:50px; }
.paseo-jj-review .jj-diff-cell code { user-select:text; }
.paseo-jj-review[data-diff-layout=split][data-copy-side=old] .jj-diff-cell:nth-child(2) code,
.paseo-jj-review[data-diff-layout=split][data-copy-side=new] .jj-diff-cell:first-child code { user-select:none; }
${Object.entries(syntaxFallbacks)
  .map(
    ([role, fallback]) =>
      `.paseo-jj-review .jj-token-paseo-${role} { color:var(--colors-syntax-${role}, var(${fallback})); }`,
  )
  .join("\n")}
`;
