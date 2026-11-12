export const reviewCss = `
.paseo-jj-review { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; height:100%; overflow:hidden; color:var(--review-ink); background:var(--review-page); font:12px/1.5 system-ui,sans-serif; }
.paseo-jj-review, .paseo-jj-review * { box-sizing:border-box; }
.paseo-jj-review .review-file:hover, .paseo-jj-review .review-directory > summary:hover { background:var(--review-hover); }
.paseo-jj-review :focus-visible { outline:2px solid var(--review-accent); outline-offset:-2px; }
.paseo-jj-review .review-history-controls { display:flex; flex:1; align-items:center; justify-content:flex-end; gap:4px; min-width:0; }
.paseo-jj-review .review-repository-picker { flex:1; min-width:0; width:100%; padding:3px 5px; border:1px solid var(--review-border); border-radius:4px; color:var(--review-ink); background:var(--review-surface); font:inherit; text-overflow:ellipsis; cursor:pointer; }
.paseo-jj-review .review-icon-button { display:inline-flex; flex:0 0 26px; align-items:center; justify-content:center; width:26px; height:26px; padding:0; border:0; border-radius:4px; color:var(--review-muted); background:transparent; cursor:pointer; }
.paseo-jj-review .review-icon-button > span { display:inline-flex; }
.paseo-jj-review .review-icon-button:hover { background:var(--review-hover); color:var(--review-ink); }
.paseo-jj-review .review-icon-button[aria-pressed=true] { color:var(--review-accent); background:var(--review-surface); }
.paseo-jj-review .review-icon-button[aria-busy=true] svg { animation:jj-review-spin 1s linear infinite; }
.paseo-jj-review button:disabled { cursor:default; opacity:.5; }
@keyframes jj-review-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) { .paseo-jj-review .review-icon-button[aria-busy=true] svg { animation:none; } }
.paseo-jj-review .review-layout { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-resizable-column { display:flex; flex:0 1 var(--review-column-width, var(--review-default-column-width)); overflow:hidden; }
.paseo-jj-review .review-changes { --review-default-column-width:320px; }
.paseo-jj-review .review-column-divider { flex-grow:0; flex-shrink:0; position:relative; cursor:col-resize; touch-action:none; user-select:none; }
.paseo-jj-review .review-column-divider::after { content:""; position:absolute; inset:0 2px; background:var(--review-border); }
.paseo-jj-review .review-column-divider:hover::after, .paseo-jj-review .review-column-divider[data-resizing=true]::after { inset:0; background:var(--review-accent); }
.paseo-jj-review .review-layout:has(.review-column-divider[data-resizing=true]) * { cursor:col-resize !important; user-select:none !important; }
.paseo-jj-review .review-document { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.paseo-jj-review .review-comparison-caption { flex-shrink:0; padding:8px 14px; border-bottom:1px solid var(--review-border); color:var(--review-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.paseo-jj-review .review-change-description { flex-shrink:0; max-height:180px; overflow:auto; padding:10px 14px; border-bottom:1px solid var(--review-border); }
.paseo-jj-review .review-change-description h2 { margin:0; font-size:14px; font-weight:600; overflow-wrap:anywhere; }
.paseo-jj-review .review-change-description p { margin:6px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
.paseo-jj-review .review-change-meta { display:flex; flex-wrap:wrap; align-items:center; gap:5px 12px; margin-top:6px; color:var(--review-muted); font-size:11px; }
.paseo-jj-review .review-change-meta code { font-family:var(--review-mono); }
.paseo-jj-review .review-bookmark-chip { display:block; max-width:160px; flex-shrink:1; padding:2px 5px; border-radius:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px; font-weight:500; color:var(--review-accent); background:color-mix(in srgb, var(--review-accent) 14%, var(--review-page)); }
.paseo-jj-review .review-bookmark-chip[data-conflict=true] { color:var(--review-removed-ink); background:var(--review-surface); }
.paseo-jj-review .review-body { display:flex; flex:1; min-height:0; min-width:0; }
.paseo-jj-review .review-files-column { --review-default-column-width:200px; }
.paseo-jj-review .review-files { flex:1; min-width:0; overflow:auto; padding:0; }
@media (max-width:1100px) {
  .paseo-jj-review .review-changes { --review-default-column-width:260px; }
  .paseo-jj-review .review-files-column { --review-default-column-width:160px; }
}
.paseo-jj-review .review-files-header { display:flex; align-items:center; gap:8px; height:36px; padding:0 8px; }
.paseo-jj-review .review-file-count { flex:1; min-width:0; color:var(--review-muted); }
.paseo-jj-review .review-directory > summary { padding:7px 12px; overflow-wrap:anywhere; cursor:pointer; color:var(--review-muted); }
.paseo-jj-review .review-tree-children { padding-left:12px; }
.paseo-jj-review .review-file { display:flex; gap:8px; width:100%; border:0; border-radius:0; padding:7px 12px; text-align:left; overflow-wrap:anywhere; background:transparent; color:inherit; font:inherit; cursor:pointer; }
.paseo-jj-review .review-file[aria-pressed=true] { background:var(--review-hover); box-shadow:inset 3px 0 var(--review-accent); }
.paseo-jj-review .review-status { font:11px/1.7 var(--review-mono); color:var(--review-muted); }
.paseo-jj-review .review-file[data-status=A] .review-status { color:var(--review-added-ink); }
.paseo-jj-review .review-file[data-status=D] .review-status { color:var(--review-removed-ink); }
.paseo-jj-review .review-file-pane { display:flex; flex:1; flex-direction:column; min-width:0; min-height:0; }
.paseo-jj-review .review-file-header { display:flex; align-items:center; gap:8px; min-height:36px; padding:5px 10px; border-bottom:1px solid var(--review-border); }
.paseo-jj-review .review-path { flex:1; min-width:0; overflow-wrap:anywhere; font-family:var(--review-mono); }
.paseo-jj-review .review-stats { color:var(--review-muted); white-space:nowrap; font-family:var(--review-mono); }
.paseo-jj-review .review-stats-added { color:var(--review-added-ink); }
.paseo-jj-review .review-stats-removed { color:var(--review-removed-ink); }
.paseo-jj-review .review-code { flex:1; min-height:0; overflow:auto; }
.paseo-jj-review .review-message { padding:20px; color:var(--review-muted); overflow-wrap:anywhere; }
.paseo-jj-review .review-error { color:var(--review-removed-ink); }
.paseo-jj-review .review-notice { padding:9px 14px; color:var(--review-muted); border-bottom:1px solid var(--review-border); }
.paseo-jj-review .review-refresh-error { padding:9px 14px; border-bottom:1px solid var(--review-border); }
`;
