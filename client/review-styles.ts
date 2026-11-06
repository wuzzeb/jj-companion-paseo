export const reviewCss = `
.paseo-jj-review { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; height:100%; overflow:hidden; color:var(--jj-ink); background:var(--jj-page); font:12px/1.5 system-ui,sans-serif; }
.paseo-jj-review, .paseo-jj-review * { box-sizing:border-box; }
.paseo-jj-review button, .paseo-jj-review select { font:inherit; color:inherit; background:var(--jj-surface); border:1px solid var(--jj-border); border-radius:5px; padding:5px 9px; cursor:pointer; }
.paseo-jj-review button:hover { background:var(--review-hover); }
.paseo-jj-review :focus-visible { outline:2px solid var(--jj-accent); outline-offset:-2px; }
.paseo-jj-review .review-toolbar { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--jj-border); flex-wrap:wrap; }
.paseo-jj-review .review-title { font-weight:600; font-size:14px; }
.paseo-jj-review .review-toolbar select { min-width:0; max-width:280px; }
.paseo-jj-review .review-current { color:var(--jj-muted); margin-left:auto; flex:1; min-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }
.paseo-jj-review .review-comparison-form { display:flex; align-items:flex-end; flex-wrap:wrap; gap:10px; padding:9px 14px; border-bottom:1px solid var(--jj-border); }
.paseo-jj-review .review-comparison-form label { display:flex; flex-direction:column; gap:3px; color:var(--jj-muted); }
.paseo-jj-review .review-expression { flex:1; min-width:160px; }
.paseo-jj-review .review-comparison-form input { min-width:0; width:100%; padding:5px 8px; border:1px solid var(--jj-border); border-radius:5px; background:var(--jj-surface); color:var(--jj-ink); font:12px/1.5 var(--jj-mono); }
.paseo-jj-review .review-expression-hint { flex:1; color:var(--jj-muted); padding:5px 0; }
.paseo-jj-review .review-pinned { padding:5px 14px; border-bottom:1px solid var(--jj-border); color:var(--jj-muted); overflow-wrap:anywhere; }
.paseo-jj-review .review-pinned code { display:block; font:11px/1.5 var(--jj-mono); }
.paseo-jj-review .review-pinned[open] { max-height:140px; overflow:auto; }
.paseo-jj-review .jj-split-head { font-family:var(--paseo-ui-font, system-ui); }
.paseo-jj-review .review-body { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-files { flex:0 0 230px; overflow:auto; border-right:1px solid var(--jj-border); padding:8px 0; }
.paseo-jj-review .review-file-count { padding:4px 12px 10px; color:var(--jj-muted); }
.paseo-jj-review .review-file { display:flex; gap:8px; width:100%; border:0; border-radius:0; padding:7px 12px; text-align:left; overflow-wrap:anywhere; background:transparent; }
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
.paseo-jj-review[data-copy-side=old] .jj-diff-cell:nth-child(2) code,
.paseo-jj-review[data-copy-side=new] .jj-diff-cell:first-child code { user-select:none; }
`;
