# Side by Side Diff Viewer Research

Research date: November 5, 2026.

## Recommendation

For the first pass, build a small renderer owned by jj Companion, using JayJay's separation of
comparison data and presentation as the model. Use Paseo's existing React Native primitives so the
viewer fits its current plugin compiler and can render on desktop, web, and native clients. Keep the
initial scope to a changed-file list, aligned before/after columns, collapsed unchanged regions,
Show all, and reliable selection/copying. Treat accurate alignment and copying as acceptance
requirements, not finishing touches.

JayJay's standalone `DiffPane` is the strongest alternative if a desktop/web-only implementation is
acceptable. It is deliberately reusable and much smaller than a complete editor. However, importing
its React component does **not** import its diff computation: a backend must supply already aligned,
highlighted rows. Its optional WASM backend brings a separate build and distribution problem.
Reusing the entire `ReviewWorkspace` would also bring review marks, notes, storage choices, and
navigation that this plugin does not currently need.

Choose Monaco if the intended destination is an editor-like review tool with incremental context
expansion, search, language folding, and richer text interaction. Its published package and
full-text input model are attractive, but its browser assets and workers are a larger fit problem
for Paseo than a small native renderer.

The recommendation is specific to the accepted first-pass scope: **read-only side-by-side review
with Show all**. A large-file selection/copy prototype should precede committing to the owned
renderer. If that fails, prefer an established viewer over accumulating editor behavior ourselves.
No dependency was added or implementation selected by this report.

## Requirements and comparison

The common case is the selected repository's `fork_point(main | @)` through `@`; a second action
reviews one selected change. Both must respect the repository selector. The main viewing surface
should be a workspace tab, with side-by-side as the default. The user accepts revealing the entire
file rather than extending an individual context region incrementally in the first pass.

| Concern                     | Monaco                                                        | JayJay directly                                                    | Owned renderer inspired by JayJay                                   |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Side-by-side                | Built-in, resizable split                                     | Built-in equal-width columns; resizing the file column is separate | Implement aligned columns and shared vertical scrolling             |
| Unchanged context           | Configurable hidden regions and reveal increments             | Collapsed context and file-wide Show all                           | Implement Show all over retained complete contents                  |
| Language block folding      | Editor feature, language-dependent                            | No equivalent in the web diff pane                                 | Outside first-pass scope                                            |
| Source supplied by backend  | Before/after text                                             | Rendered `DiffView`; optional engine consumes text                 | Text plus validated hunks or aligned rows                           |
| Diff computation            | Included in editor                                            | Separate Rust/WASM engine or host implementation                   | Reuse jj output and an agreed parser, or a tested text-diff library |
| Search and text interaction | Existing editor functionality                                 | Browser selection; no editor-style find API in `DiffPane`          | Copy fidelity needs explicit work; search can follow later          |
| Plugin compilation          | CSS and worker adaptation                                     | CSS adaptation; more assets if using WASM                          | Existing JS bundle and React Native styles                          |
| Native mobile client        | No native renderer; upstream does not support mobile browsers | DOM components need a web embedding surface                        | Can use the current native plugin renderer                          |
| Dependency delivery         | Published npm package                                         | Unpublished source package, pinned artifact or source required     | Own source; any parser/diff library remains a dependency decision   |
| Primary long-term cost      | Worker, model, theme, and host integration                    | Upstream updates, engine packaging, and host adapter               | Alignment, selection, accessibility, and performance                |

The Monaco capabilities above come from its [diff options][m-options], [editor API][m-api], and
[README][m-readme]. JayJay behavior comes from its [component][j-pane], [styles][j-styles], and
[backend contract][j-backend]. An owned renderer's capabilities are proposed work, not existing
functionality.

## Paseo integration constraints

### A workspace tab is available but a browser application host is not

The SDK supports plugin-rendered workspace panels. The existing History panel already uses that
mechanism, so registration is straightforward. It does not expose the built-in `DiffDocument`, a
public native diff-tab opener, or a generic interactive web-app host. The built-in tab model
distinguishes a working diff and a commit SHA; it does not itself provide a general two-endpoint
plugin comparison API. [SDK contracts][p-contracts], [UI exports][p-ui], [tab model][p-tabs].

Paseo compiles a client plugin with esbuild to a CommonJS bundle targeting ES2020, using the neutral
platform. React, React Native, React Query, Zod, and the SDK are supplied by the host. The compiler
returns the first JavaScript output, with no stylesheet or worker-asset delivery pipeline in this
path. The runtime evaluates that bundle against its host modules. [Compiler][p-compiler],
[evaluator][p-evaluator].

This does not categorically prohibit DOM rendering on desktop/web. It means a DOM component must be
guarded from native clients, and its CSS must be delivered explicitly. For a simple viewer, a build
step that flattens scoped CSS into a generated client module and a web-only style mount is
plausible. That is an integration to validate, not an existing SDK feature. The client TypeScript
configuration would also need DOM types for browser code.

`DocumentFrame` is not a shortcut for packaging an HTML application: on web it accepts blob URLs and
applies an empty sandbox for HTML, disabling scripts. The PDF exception does not make it an
application container. Monaco or JayJay would need direct web rendering or an additional host
capability, rather than an unchanged `DocumentFrame`. [Document frame][p-frame], [sandbox
policy][p-sandbox].

### Build hooks help but do not deliver runtime assets

Paseo's manifest supports build commands. They could generate client JavaScript, flattened styles,
or embedded resources before compilation. The hook does not by itself provide URLs for a worker,
font, or WASM file on a connected client's device. A daemon filesystem path is not a client URL.
Remote-host use makes that distinction particularly important. [Manifest][p-manifest].

A browser-worker implementation could prebuild and embed its worker and WASM bytes, then create
client-side URLs. That needs lifecycle management and validation against the app's worker and
content-security policies. It should not be described as a drop-in Vite build.

## Monaco

### What we would reuse

Monaco accepts complete original and modified text models and computes the diff. We would own the
file list, jj comparison sessions, and a small React wrapper. Its options support side-by-side
rendering, a resizable divider, hidden unchanged regions, context and reveal counts, and disabling
automatic inline fallback. Whitespace comparison must be configured explicitly:
`ignoreTrimWhitespace` defaults to true. [Diff options][m-options].

Its API supplies change navigation, model replacement, view-state save/restore, layout, and
disposal. Those are useful for restoring a file's reading position and cleaning up closed tabs.
[Editor API][m-api]. Hide-unchanged-region controls and language folding are different features;
satisfying Show all would not require us to enable every editor feature.

### Integration and maintenance

Monaco publishes an npm package with an ESM build. Its documented integrations arrange separate
editor/language worker bundles. For a read-only viewer, we should select needed languages and
features instead of loading the whole editor package indiscriminately. No React wrapper package is
inherently required. [README][m-readme], [ESM integration guide][m-integration].

Paseo's evaluated single-bundle client path requires a custom build adapter for CSS and workers, or
a supported web-app surface upstream. Direct use also needs DOM access and correct model disposal
when files, repositories, and tabs change. Worker creation on the actual Electron/web host is an
acceptance test; build success alone is insufficient.

On November 5, `npm view monaco-editor version dist.unpackedSize license --json` returned version
`0.57.0`, an unpacked package size of `101,674,083` bytes, and MIT. The package size includes
distributable material beyond a selected application build; **it is not a predicted download size or
memory footprint**. Monaco was not installed or bundled in these probes.

Monaco's upstream README explicitly excludes mobile browser support. Even an eventual native WebView
bridge would not turn it into a supported mobile editor. Its API is appropriate for
desktop/web-first work. [README][m-readme].

### Fit for this plugin

Monaco offers the most ready-made interaction and the simplest renderer input contract. It becomes
the better choice if incremental expansion, editor search, keyboard navigation, or exact text
selection grow beyond a small viewer's scope. It is less compelling while Show all is sufficient and
the first release should work through Paseo's current native rendering path.

## Using JayJay directly

### Three different levels of reuse

**Standalone `DiffPane`.** This exported component accepts `DiffView`, a split flag, labels, Show
all, optional review controls, and optional theme selection. Omitting review controls avoids note
and reviewed-group UI. Its input already contains rows, cells, word styles, syntax tokens, line
numbers, and anchors. It does not compute those from source text. [React exports][j-exports], [diff
types][j-types], [component][j-pane].

**`ReviewWorkspace` and `useReview`.** These add a file tree, responsive layouts, notes, marks,
header controls, loading, and a backend controller. The backend contract requires `open`, `render`,
and `mutate`, with optional image loading. `notes={false}` disables note affordances; it does not
remove all marking controls. This is a review application shell, not merely a read-only diff widget.
[Workspace][j-workspace], [backend contract][j-backend].

**Optional local backend.** `LocalReviewClient` starts a module worker. That worker uses
Rust-generated WASM to compute aligned and highlighted rows and manage review state through
IndexedDB. It supports full before/after bundles and lazy content loading. Its engine loader uses
Vite-specific `import.meta.glob` and `import.meta.env`; its worker URL uses `import.meta.url`. The
stock build generates ten packs, including the grammar-free base and language groups, using Rust,
wasm-bindgen, and the documented toolchain. [Local client][j-local], [engine loader][j-engine],
[worker][j-worker], [build script][j-build].

For our read-only tab, the smallest direct UI reuse is the first level. To preserve JayJay's
computed presentation, it still needs a matching engine. Possibilities include a native helper using
`jj-diff`, a server-side WASM adapter, or a custom browser worker around the exported `render_diff`
function. The latter could omit review persistence, but it would be a custom adapter to maintain.
The React-only import needs no runtime WASM; the data producer still must exist. [Render
implementation][j-render], [package guide][j-guide].

### Context behavior and interaction limits

The web pane renders collapsed context as a button invoking `showAll`. Its workspace configures that
as `showAll: true` for subsequent rendering. The WASM renderer then computes the full file diff.
This meets the accepted first-pass behavior. It does not expose per-region expansion or a
source-code folding tree.

Its shared row structure keeps left and right cells vertically aligned, using CSS grid and wrapping
long lines. The standalone pane renders every supplied row and token span; it does not virtualize a
large file. `ReviewWorkspace` lazily loads file sections, which is different from virtualizing rows
within an expanded file. Large Show all views therefore need measurement. [Component][j-pane],
[styles][j-styles], [workspace][j-workspace].

It also lacks Monaco's built-in editor search and view-state API. Browser copy behavior needs an
actual check for multiline, wrapped, single-side selections: the component uses ordinary DOM cells,
and line numbers are excluded by CSS, but that does not establish Diffview-equivalent copying.

### Consuming an unpublished package

A submodule is **one option**, not a requirement. The package guide documents packing a local npm
tarball. The realistic choices are:

| Delivery method                                         | Benefits                                                              | Costs for this repository                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Pinned submodule or separate source checkout plus build | Keeps upstream history and update provenance                          | Must provision the checkout, materialize it in workspaces, install/build its toolchain, and adapt module paths |
| Pinned packed artifact                                  | Installable through the package manager; can contain generated assets | We must build, store, and version the artifact; no upstream npm release lifecycle                              |
| Vendored snapshot of selected source                    | Reproducible checkout without a live nested repository                | We own update diffs and any compatibility patches; a selected copy is effectively a maintained fork            |

An npm Git dependency on the monorepo root is not automatically an install of its `web/review`
workspace. A package path or artifact must be arranged explicitly. The standard upstream packing
instructions build WASM first, although the React-only runtime does not need it. A smaller
source/artifact workflow would be our packaging adaptation. [Package guide][j-guide], [package
manifest][j-package].

Paseo's managed Git installer does run recursive submodule initialization. That supports the
installer side, but does not populate an ordinary separate checkout inside every jj workspace
automatically. This repository already uses setup hooks for nested workspaces. [Managed-source
checkout][p-managed], [plugin lifecycle documentation](../../README.md).

There is also a compiler boundary issue: plugin-owned modules belong in `client`, `server`, or
`shared`; dependency resolution has separate handling for linked packages. A relative import from a
sibling `jayjay/web/review` checkout is not an assumed supported layout. Use a genuine packaged
dependency or a deliberate `client/vendor` layout and verify the actual compiler.
[Compiler][p-compiler].

The package declares React `^19.3.1`; this plugin declares `19.1.0`, and the reference Paseo app
declares `19.2.3`. Paseo supplies the running React instance. Installing another React cannot
satisfy a missing host feature. The source we inspected does not prove every higher-version
dependency is necessary, but lowering the peer range needs compatibility tests rather than an
automatic override. [Package manifest][j-package], [plugin dependencies](../../package.json), [Paseo
dependencies][p-package].

JayJay declares the review package and Rust crates Apache-2.0, with a separate MIT Seti font. Its
application/shell has a different license. A dependency or copied-source decision should identify
the exact files and notices involved; the app's badge is not the package's license declaration.
[License overview][j-license].

## An owned renderer inspired by JayJay

### The useful boundary to keep

The strongest design to borrow is a renderer-independent comparison session:

```text
Selected repository and comparison
              ↓
Pinned jj operation and file identities
              ↓
Changed-file list and complete before/after contents
              ↓
Validated hunks or aligned display rows
              ↓
Paseo file list and side-by-side viewer
```

The server owns repository access and comparison semantics. Presentation never derives a path from
the selected UI label, guesses a parent commit, or reads whatever happens to be on disk later. Show
all changes display state over the same session, rather than silently updating the comparison.

Keep one selected file mounted. A row has a left cell, a right cell, and optional unchanged-region
metadata. A deleted block receives blank alignment space on the right; an inserted block receives it
on the left. Native Text/View components can render this with a shared vertical container. Wrap
policy, horizontal scrolling, copy behavior, and accessibility must be designed together.
Virtualization is useful, but variable-height rows and native text selection require testing before
choosing it.

### Scope we would actually own

We would implement file selection, line alignment, context collapse, Show all, line-number
presentation, empty states, scrolling, and copying. Syntax highlighting and word-level highlighting
are separate enhancements unless a selected computation library provides them. A viewer that only
colors whole changed lines should not be represented as already equivalent to JayJay or Monaco.

We should not invent a new text-diff algorithm. For an independent implementation, jj can produce
the canonical comparison and a tested parser can turn its Git-format patch into validated hunks.
Complete source files then supply unchanged regions for Show all. A tested text-diff library over
the two complete texts is another option; its grouping can differ from jj's patch output.
Parser/library selection remains a dependency discussion.

Taking only design inspiration creates no runtime dependency on JayJay. Copying selected React/CSS
source instead creates an owned derivative: it preserves more upstream behavior but retains
provenance and update work, and it remains DOM-based unless ported. Reusing `jj-diff` beneath an
owned UI is a useful hybrid, but it is not full independence from JayJay's libraries.

### Why the smaller scope is credible and where it stops

The accepted Show all behavior removes the need for incremental region identity, editor language
services, or an RPC per revealed chunk. Existing jj Companion already supplies repository
resolution, RPC contracts, panel registration, persisted tab state, and graph selection. Those are
reusable infrastructure, not a completed diff backend.

The difficult parts remain text selection across virtualized/wrapped rows, proportional changes with
many inserted or removed lines, and rendering very large expanded files. If the prototype cannot
handle those cleanly, stop extending the custom renderer and reconsider Monaco or JayJay directly.
Code folding, editing, merge resolution, review notes, and staging are outside this first pass.

## Correct jj comparisons are common work

### Branch comparisons and changes

Resolve `main` in the selected repository and use the union spelling `fork_point(main | @)`. If
`main` is absent or the fork point is not a single revision, surface the condition and require an
explicit base policy. Do not silently select an arbitrary ancestor.

For a single change, use jj's `diff -r` semantics. A merge change is compared with the automatic
merge of all parents, not simply its first parent. This is independent of the viewer library.

Ordinary before/after revision files can be read with `jj file show` using pinned revisions. For
merge comparisons, an external diff capture helper is another CLI-only route: `jj diff --tool`
materializes the left and right trees, including the merged-parent baseline. The helper must read or
copy content before jj removes its temporary directories. File summaries should preserve source and
target paths for renames, file types, and binary status. [jj external-tool documentation][jj-tools];
local `jj diff --help`, `jj file show --help`, and template help were also checked on 0.47.0.

### Snapshots and asynchronous agents

History currently avoids snapshotting. An explicit Open diff or Refresh could snapshot the selected
working copy once, then pin an operation and comparison IDs. This would include pending edits
without making background history polling mutate jj. The snapshot action is a product choice to make
explicit during implementation; an ignored-working-copy read sees the last snapshot instead.

Cache by repository/workspace identity, pinned comparison, file paths, and display options. File
switching, Show all, and delayed RPC results must keep referring to that session. Use
cancellation/generation checks so an old response cannot replace a newer repository or comparison.
Refresh should preserve scroll/expansion state when the file's identity still matches.

Binary files, conflicts, symlinks, executable-bit-only changes, missing files, and large files need
explicit states. A text renderer must not decode arbitrary binary bytes or hide a metadata-only
change as an empty diff. None of the three frontend choices resolves those repository semantics
automatically.

## Build and semantic probes

The reproducible probes are in [diff-viewer-probes.mjs](diff-viewer-probes.mjs). Run from a prepared
plugin checkout containing the ignored JayJay reference checkout:

```sh
node docs/research/diff-viewer-probes.mjs
```

They use the already installed esbuild dependency through `tsx`; they install nothing and write no
application files. The jj fixture uses a disposable repository under the temporary directory. The
bundle probe reproduces the asset-relevant settings from Paseo, **not** the full import-boundary
checks, evaluator, or browser runtime.

| Probe                                                  | Observed result                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| JayJay standalone `DiffPane`, external host React      | Bundles successfully: 4,734 bytes minified JS; 1,987 bytes gzip                                       |
| `ReviewWorkspace` and `useReview`, external host React | Bundles successfully: 39,772 bytes minified JS; 13,461 bytes gzip                                     |
| `DiffPane` plus supplied stylesheet                    | Build fails: CSS import has no output path; no `.woff2` loader                                        |
| Stock `LocalReviewClient` in CommonJS                  | Emits an empty-`import.meta` warning; the emitted JS is not a functioning packaged worker integration |
| Merge baseline exported through `jj diff --tool`       | Left file contains both parents' edits; right file contains the merge change's additional edit        |
| Full context and operation stability                   | Both sides retain 120 lines; the pinned read leaves the operation ID unchanged                        |

The JavaScript figures exclude React, CSS, fonts, WASM, workers, repository data, and our adapter.
They are not end-to-end size or speed comparisons with Monaco. Esbuild was 0.28.2 and jj was 0.47.0.
The runtime behavior of Monaco, desktop DOM mounting, native selection, and large Show all views
remains to be measured; no speculative timing or memory figures are used here.

## Prototype and decision gates

1. **Prove the common data contract.** In a disposable fixture, exercise branch, single-change, and
   merge baselines; added/deleted/renamed and binary files; non-colocated and nested repositories;
   and refresh while an agent rewrites `@`. Return one pinned file pair and validated change
   metadata.
2. **Prototype the owned viewer in the actual Paseo tab.** Render that file pair using native
   components, side-by-side with Show all. Verify multiline single-side copying, long lines, mouse
   selection, keyboard focus, resizing, and reopening the tab. Use ordinary and large files,
   including a 10,000-line mostly unchanged file and a large insertion/deletion. Record file-switch
   latency and responsiveness instead of assuming virtualization solves them.
3. **Use the standalone JayJay pane as the comparison prototype if needed.** Guard it to web, prove
   scoped CSS delivery, and feed the same fixture through a real computation adapter. Check the host
   React version and line/copy fidelity. Do not add the full WASM review/storage stack just to make
   the small component render.
4. **Choose based on the actual failure.** Prefer the owned renderer if it meets the reading/copy
   requirements with a small implementation. Prefer JayJay if its existing alignment/highlighting
   outweighs source and engine maintenance. Prefer Monaco if the remaining problem is editor
   interaction or incremental folding, provided its worker/assets path is proven in Paseo.

Before implementation, the decisions that materially change the work are desktop-only versus native
support, whether syntax/word highlighting is required initially, and which parser or diff engine may
be added. No new repository, submodule, npm package, or Rust/WASM toolchain is necessary merely to
finish this investigation.

## Sources and inspected revisions

The local reference checkouts were inspected at these commits, with permalink sources below:

- Paseo: `7917773bd07088602563bdc74d8613a45bdf4139`, package version 0.15.2.
- JayJay: `8f4cf6fccfaab803b7bc603d95e54faa9988b14f`.
- jj Companion: research is a new change above `4c42722e`, preserving the completed repository
  selector and branch-ordering work.
- Monaco: current official API/integration documentation and npm metadata read November 5, 2026. No
  Monaco runtime benchmark was performed.

[p-contracts]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/plugin/src/client/contracts.ts
[p-ui]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/plugin/src/client/ui.ts
[p-tabs]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/app/src/workspace-tabs/model.ts
[p-compiler]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/server/src/server/plugins/compiler-build.ts
[p-evaluator]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/app/src/plugins/evaluate.ts
[p-frame]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/app/src/file-panels/document-frame/index.web.tsx
[p-sandbox]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/app/src/file-panels/document-frame/sandbox.ts
[p-manifest]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/server/src/server/plugins/manifest.ts
[p-managed]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/server/src/server/plugins/managed-source.ts
[p-package]:
  https://github.com/getpaseo/paseo/blob/7917773bd07088602563bdc74d8613a45bdf4139/packages/app/package.json
[j-guide]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/README.md
[j-package]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/package.json
[j-exports]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/react.ts
[j-pane]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/components/diff/DiffPane.tsx
[j-types]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/model/diff.ts
[j-styles]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/styles/diff.css
[j-backend]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/model/backend.ts
[j-workspace]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/components/ReviewWorkspace.tsx
[j-local]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/local/LocalReviewClient.ts
[j-engine]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/local/engine.ts
[j-worker]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/src/local/review.worker.ts
[j-build]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/scripts/build-diff-web.sh
[j-render]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/web/review/wasm/src/render.rs
[j-license]:
  https://github.com/hewigovens/jayjay/blob/8f4cf6fccfaab803b7bc603d95e54faa9988b14f/README.md#license
[m-readme]: https://github.com/microsoft/monaco-editor/blob/main/README.md
[m-integration]: https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md
[m-options]:
  https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IDiffEditorBaseOptions.html
[m-api]:
  https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IDiffEditor.html
[jj-tools]: https://docs.jj-vcs.dev/latest/config/#external-diff-tools
