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
.paseo-jj-review :is(.review-toolbar, .review-comparison-dialog, .review-file-header, .review-files-header) :is(button, select) { font:inherit; color:inherit; background:var(--jj-surface); border:1px solid var(--jj-border); border-radius:5px; padding:5px 9px; cursor:pointer; }
.paseo-jj-review :is(.review-toolbar, .review-comparison-dialog, .review-file-header, .review-files-header) button:hover, .paseo-jj-review .review-file:hover, .paseo-jj-review .review-directory > summary:hover { background:var(--review-hover); }
.paseo-jj-review :focus-visible { outline:2px solid var(--jj-accent); outline-offset:-2px; }
.paseo-jj-review .review-toolbar { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(320px,1fr); align-items:center; gap:12px; padding:8px 12px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-toolbar-start, .paseo-jj-review .review-toolbar-actions { display:flex; align-items:center; gap:10px; min-width:0; }
.paseo-jj-review .review-toolbar-actions { justify-self:end; white-space:nowrap; }
.paseo-jj-review .review-title { font-weight:600; font-size:14px; }
.paseo-jj-review .review-toolbar select { min-width:0; max-width:280px; text-overflow:ellipsis; }
.paseo-jj-review .review-current { color:var(--jj-muted); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; }
.paseo-jj-review .review-comparison-dialog { width:min(520px, calc(100vw - 32px)); max-height:calc(100vh - 32px); padding:0; overflow:auto; border:1px solid var(--jj-border); border-radius:8px; color:var(--jj-ink); background:var(--jj-page); font:inherit; box-shadow:0 12px 40px #0006; }
.paseo-jj-review .review-comparison-dialog::backdrop { background:#0006; }
.paseo-jj-review .review-dialog-content { padding:20px; }
.paseo-jj-review .review-dialog-content h2 { margin:0 0 16px; font-size:16px; }
.paseo-jj-review .review-comparison-form { display:flex; flex-direction:column; gap:12px; }
.paseo-jj-review .review-comparison-form label { display:flex; flex-direction:column; gap:4px; color:var(--jj-muted); }
.paseo-jj-review .review-comparison-form input { min-width:0; width:100%; padding:5px 8px; border:1px solid var(--jj-border); border-radius:5px; background:var(--jj-surface); color:var(--jj-ink); font:12px/1.5 var(--jj-mono); }
.paseo-jj-review .review-expression-hint { color:var(--jj-muted); }
.paseo-jj-review .review-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
.paseo-jj-review button:disabled { cursor:default; opacity:.5; }
.paseo-jj-review .review-pinned { margin-top:16px; color:var(--jj-muted); overflow-wrap:anywhere; }
.paseo-jj-review .review-pinned code { display:block; font:11px/1.5 var(--jj-mono); }
.paseo-jj-review .review-pinned[open] { max-height:140px; overflow:auto; }
@media (max-width:800px) {
  .paseo-jj-review .review-toolbar { grid-template-columns:auto minmax(0,1fr) auto; gap:8px; }
  .paseo-jj-review .review-toolbar select { max-width:140px; }
}
.paseo-jj-review .jj-split-head { font-family:var(--paseo-ui-font, system-ui); }
.paseo-jj-review .review-layout { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-changes { display:flex; flex:0 0 320px; min-width:260px; overflow:hidden; border-right:1px solid var(--jj-border); }
.paseo-jj-review .review-document { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.paseo-jj-review .review-change-description { flex-shrink:0; max-height:180px; overflow:auto; padding:10px 14px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-change-description h2 { margin:0; font-size:14px; font-weight:600; overflow-wrap:anywhere; }
.paseo-jj-review .review-change-description p { margin:6px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.paseo-jj-review .review-change-meta { display:flex; flex-wrap:wrap; align-items:center; gap:5px 12px; margin-top:6px; color:var(--jj-muted); font-size:11px; }
.paseo-jj-review .review-change-meta code { font-family:var(--jj-mono); }
.paseo-jj-review .review-body { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-files { flex:0 0 200px; min-width:0; overflow:auto; border-right:1px solid var(--jj-border); padding:8px 0; }
@media (max-width:1100px) {
  .paseo-jj-review .review-changes { flex-basis:260px; }
  .paseo-jj-review .review-files { flex-basis:160px; }
}
.paseo-jj-review .review-files-header { display:flex; align-items:center; gap:8px; padding:4px 10px 10px; }
.paseo-jj-review .review-file-count { flex:1; min-width:0; color:var(--jj-muted); }
.paseo-jj-review .review-directory > summary { padding:7px 12px; overflow-wrap:anywhere; cursor:pointer; color:var(--jj-muted); }
.paseo-jj-review .review-tree-children { padding-left:12px; }
.paseo-jj-review .review-file { display:flex; gap:8px; width:100%; border:0; border-radius:0; padding:7px 12px; text-align:left; overflow-wrap:anywhere; background:transparent; color:inherit; font:inherit; cursor:pointer; }
.paseo-jj-review .review-file[aria-pressed=true] { background:var(--review-hover); box-shadow:inset 3px 0 var(--jj-accent); }
.paseo-jj-review .review-status { font:11px/1.7 var(--jj-mono); color:var(--jj-muted); }
.paseo-jj-review .review-file[data-status=A] .review-status { color:var(--jj-added-ink); }
.paseo-jj-review .review-file[data-status=D] .review-status { color:var(--jj-removed-ink); }
.paseo-jj-review .review-file-pane { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.paseo-jj-review .review-file-header { display:flex; align-items:center; gap:12px; padding:9px 14px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-path { flex:1; min-width:0; overflow-wrap:anywhere; font-family:var(--jj-mono); }
.paseo-jj-review .review-stats { color:var(--jj-muted); white-space:nowrap; font-family:var(--jj-mono); }
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
