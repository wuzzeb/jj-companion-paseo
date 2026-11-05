# Side by Side Diff Viewer Research

Research date: November 5, 2026.

## Recommendation

Start with a **Review branch in Neovide** action that preserves the existing leader binding:
`DiffviewOpen 'fork_point(main|@)'`. Reuse a Neovim instance associated with the Paseo workspace;
launch Neovide when none is available. This removes workspace hunting while retaining the user's
existing diffview-plus workflow. Neovide is the confirmed launch frontend.

The eventual in-app viewer is **desktop/web-only**. Phone support is explicitly out of scope, so
React Native rendering and native mobile compatibility should not determine the renderer choice.
Prototype an existing web component before writing a new renderer. JayJay's standalone `DiffPane`
and the additional `react-diff-view` candidate are the first components to compare. Keep Monaco as
the richer editor option if search, selection, or folding requirements justify its integration.

Prebuilding JayJay's CSS into JavaScript is feasible: the supplementary build probe flattened its
styles and embedded its font successfully. This changes CSS from an unsupported direct import to an
adapter we can own. It does not automatically solve its worker/WASM backend or host React
compatibility. Importing `DiffPane` still requires aligned diff rows from a computation backend.
Avoid adopting its entire review application just to get a file viewer.

An owned browser renderer remains an option if the existing components fail the interaction tests;
it is no longer the default based on cross-platform concerns. Keep the first viewer read-only,
side-by-side, and limited to file navigation, collapsed context, Show all, and reliable copying. Do
not embed a Neovim GUI merely to obtain Diffview inside Paseo.

The separate `jayjay-review-tab` experiment now implements the standalone-pane approach described
below. The Neovide launcher remains separate from this branch.

## Workspace-tab prototype

Open **jj Review** with the workspace command **Open jj review**. The prototype vendors JayJay's
standalone `DiffPane`, its model/theme metadata, and diff stylesheet from
`8f4cf6fccfaab803b7bc603d95e54faa9988b14f`. The package's Apache-2.0 license and provenance are in
`client/vendor/jayjay`. Import extensions and readonly annotations are adapted locally; component
rendering behavior stays upstream's. No new npm dependency, font, worker, WASM, or second React root
is shipped. The stylesheet is a generated string in the ordinary plugin client bundle.

jj produces complete-context, per-file Git-format patches between pinned endpoints. The server
adapts these into aligned JayJay rows; the client collapses unchanged context and retains the full
rows for Show all. This tests the upstream **renderer**, not JayJay's Rust diff/syntax engine or its
review-storage application. It has line coloring but no syntax or word highlighting. Binary and
metadata-only changes show notices. The current action is the branch comparison; selected changes,
comments, review marks, and arbitrary revsets are outside this prototype.

Explicit Open/Refresh snapshots once, then pins the operation, base, and target. File reads verify
the selected repository and changed-file membership and keep using the pinned operation. No
background refresh moves the comparison. The server's jj output limit is 16 MiB and the row adapter
limits each file to 20,000 diff lines. Large files are not virtualized.

Validation on this branch:

- Paseo 0.15.2's actual `compileDirectoryPlugin` accepts both bundles. The client bundle is about 75
  KB, including the unchanged History feature, vendored pane, and embedded styles.
- A headless Chromium harness evaluated those compiled bundles, supplied SDK context/RPC shims, and
  mounted the registered panel with React/React DOM 19.1.0. This is browser evidence, not a claim of
  having reloaded the plugin in the user's running Paseo application. The preview harness loaded its
  host React runtime from a CDN; the plugin itself always uses Paseo's host React.
- Both columns copied seven exact lines, excluding the opposite side and gutters. Switching columns
  clears the prior DOM selection so a new drag does not start dragging the old range.
- Wrapped lines stayed aligned. File navigation, binary notices, nested repository switching,
  collapsed context, Show all, and explicit refresh after an agent rewrite worked without browser
  console errors.
- Expanding a 10,000-line text file took about 1.3 seconds in that harness, with roughly 39 MB of
  reported JS heap in the preview page. This is one synthetic measurement, not a performance
  guarantee or evidence for every file size.
- Real-jj tests cover snapshot stability after rewrites, file metadata, literal names, additions,
  deletions, renames, EOF markers, binaries, and repository/path validation.

## Requirements and comparison

The common case is the selected repository's `fork_point(main | @)` through `@`; a second action
reviews one selected change. Both must respect the repository selector. The eventual viewing surface
should be a desktop/web workspace tab, with side-by-side as the default. No phone viewer is
required. The user accepts revealing the entire file rather than extending an individual context
region incrementally in the first pass.

| Concern                     | Monaco                                            | JayJay directly                                                    | Owned renderer inspired by JayJay                                   |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Side-by-side                | Built-in, resizable split                         | Built-in equal-width columns; resizing the file column is separate | Implement aligned columns and shared vertical scrolling             |
| Unchanged context           | Configurable hidden regions and reveal increments | Collapsed context and file-wide Show all                           | Implement Show all over retained complete contents                  |
| Language block folding      | Editor feature, language-dependent                | No equivalent in the web diff pane                                 | Outside first-pass scope                                            |
| Source supplied by backend  | Before/after text                                 | Rendered `DiffView`; optional engine consumes text                 | Text plus validated hunks or aligned rows                           |
| Diff computation            | Included in editor                                | Separate Rust/WASM engine or host implementation                   | Reuse jj output and an agreed parser, or a tested text-diff library |
| Search and text interaction | Existing editor functionality                     | Browser selection; no editor-style find API in `DiffPane`          | Copy fidelity needs explicit work; search can follow later          |
| Plugin compilation          | CSS and worker adaptation                         | CSS adaptation; more assets if using WASM                          | Own browser JS and CSS adapter                                      |
| Native mobile client        | Out of scope                                      | Out of scope                                                       | Out of scope                                                        |
| Dependency delivery         | Published npm package                             | Unpublished source package, pinned artifact or source required     | Own source; any parser/diff library remains a dependency decision   |
| Primary long-term cost      | Worker, model, theme, and host integration        | Upstream updates, engine packaging, and host adapter               | Alignment, selection, accessibility, and performance                |

The Monaco capabilities above come from its [diff options][m-options], [editor API][m-api], and
[README][m-readme]. JayJay behavior comes from its [component][j-pane], [styles][j-styles], and
[backend contract][j-backend]. An owned renderer's capabilities are proposed work, not existing
functionality.

## First experiment with Neovide reuse

### Match the existing branch command

The branch action should pass `fork_point(main|@)` as **one literal argument**, plus the selected
repository's `-C{path}` argument. Explicit `--adapter=jj` avoids accidentally choosing Git for a
colocated checkout. The plugin exposes `require("diffview").open(args)`, allowing a Lua argument
list rather than constructing an Ex command with nested quotes. This also avoids changing the
editor's global cwd merely to review the nested repository. [Diffview Lua entry][d-open], [argument
dispatch][d-lib], [jj adapter][d-adapter].

The adapter resolves a bare revision as the left side and uses the working copy on the right. That
is exactly the existing branch-review behavior. `main...@` also uses a live right side;
`<base-id>..<head-id>` instead compares fixed endpoints. Preserve the user's current live workflow
for the first launcher, rather than promising immutable content after handing control to an
interactive editor. A future in-app review session should still use the pinned design below.
[Diffview jj adapter][d-adapter].

A bare selected change ID is **not** sufficient for a single-change action: it would compare that
change against the current workspace. For a one-parent change, resolve parent and selected commit
and send their endpoint range. For a merge, do not silently choose a parent; use jj's materialized
merged-parent baseline and `DiffviewDiffDirs`, with copied temporary trees retained until the view
closes, or defer that action until this lifecycle is implemented. The directory view is editable by
default, so such a review integration must set buffers read-only deliberately. Start with the
most-used branch action rather than allowing this less-common case to delay reuse. [Directory
comparisons][d-doc], [jj adapter][d-adapter].

### Identify a workspace editor rather than any running editor

`--listen` establishes an RPC endpoint; `--server` chooses one; `--remote-send` sends keys; and
`--remote-expr` evaluates an expression and returns a result. They do not supply a global mapping
from workspace to editor. Neovim's CLI `--serverlist` is not supported. Automatic listen addresses
on existing instances are useful, but must be discovered or registered. [Neovim remote
API][n-remote].

Use a small editor-side registration hook, or an explicit one-time registration command, to record
`v:servername`, a canonical workspace path, and process identity in a per-user registry. Refresh
registration when directory context changes and validate a record by RPC before use. This is needed
to adopt an editor opened through the user's existing Snacks workflow, rather than only reusing
instances launched by Paseo. Existing unregistered instances require that hook or bounded discovery;
`--remote-send` alone will not find them automatically.

Key reuse by the **canonical Paseo workspace directory**, not the shared jj repository, a change ID,
or the workspace nickname. Sibling workspaces need separate editors even though they share `.jj`.
The root and its selected child repository can share one editor by passing `-C` per review. Never
repurpose an unrelated running editor just because it is the first reachable socket. If several
editors are registered to the same workspace, prefer the previously chosen instance or require a
selection rather than guessing from window titles.

Use a private runtime directory and a short hash in socket filenames. Serialize launches per
workspace. Check the recorded socket, validate its workspace identity, and dispatch if healthy.
Otherwise spawn Neovide in the workspace with Neovim's `--listen <socket>` arguments passed after
`--`, then wait with a bounded timeout for both RPC and diffview-plus readiness. A socket appearing
is not proof that a lazy-loaded command is ready. Do not delete a live socket or launch a second
window merely because an RPC times out.

Prefer an acknowledged RPC/Lua call over simulating keystrokes. `--remote-send` can implement the
user's idea, but insert mode, prompts, command-line input, and quoting complicate its reliability.
`--remote-expr` can carry a fixed Lua expression and serialized argument data to call the module
entry after plugin loading. Return a structured success or error; do not treat queued input as proof
that the diff opened. The transport must not interpolate paths or revsets into shell code.

### Launching and focusing are separate

Neovide can start Neovim or attach to an existing server. `neovide --server <socket>` attaches a
GUI; it does not mean “raise the already attached window.” Launch a new frontend only when needed,
and track whether an attached UI is Neovide. Its command line supports workspace cwd and Linux
window identifiers. A compositor-specific focus hook can use those identifiers, but focusing is
separate from successful RPC delivery and must be tested in the user's session. [Neovide
CLI][n-neovide].

All launcher commands run on the Paseo daemon host. The initial experiment targets the user's local
Linux desktop session with Neovide installed. Verify that the daemon inherits the display/session
environment. Remote-host use needs an explicitly configured launch or forwarding strategy; a daemon
launch does not open an application on the browser's machine. Closing the panel or reloading the
plugin must not terminate an editor the user is working in.

A scratch headless Neovim 0.12.6 probe verified an acknowledged `--remote-expr` round trip,
cwd/server identity, and exact argument transport for `fork_point(main|@)` plus a path containing
spaces and an apostrophe. It used a mocked `diffview.open`, not the user's running editor. No GUI
was launched; actual plugin readiness, existing-instance registration, and Neovide window focus
remain prototype tests. The installed diffview-plus source and current upstream adapter were
inspected as well.

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

### Prebuilding browser assets for Paseo

The proposed approach is valid for CSS: run an asset prebuild before Paseo compiles the plugin.
Flatten `@import` rules, embed required font URLs as data URLs, and emit a generated client module
exporting the CSS string. On web, mount that scoped stylesheet once and remove it when its owner
unloads. Keep host React external and render the component through Paseo's existing React tree;
there is no need to ship a second React root merely to load styles.

The supplementary probe built JayJay's full stylesheet with esbuild's `.woff2` data-URL loader:
87,210 bytes of CSS became 87,680 bytes of generated JavaScript, or 41,184 bytes gzip. No `@import`
remained and the font was embedded. This includes the full theme/font set; a standalone pane might
need less. These figures prove build-time transformation, not mounted rendering or total bundle
size.

Use the manifest build hook to produce files under the allowed `client` tree. An evaluated plugin
has no stable module URL for unresolved `import.meta.url` worker paths, so workers and WASM need a
separate prebuild with explicit embedded bytes or hosted asset URLs. A lightweight worker around
JayJay's exported render function is more focused than carrying its IndexedDB review backend.
Monaco's worker build likewise needs its own initialization adapter. Prove web runtime policy and
cleanup behavior; the script-disabled `DocumentFrame` remains unsuitable for either application.

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
bridge would not turn it into a supported mobile editor. This is not a blocker for the agreed
desktop/web-only scope. [README][m-readme].

### Fit for this plugin

Monaco offers the most ready-made interaction and the simplest renderer input contract. It becomes
the better choice if incremental expansion, editor search, keyboard navigation, or exact text
selection grow beyond a small viewer's scope. Its integration must be compared with smaller web
viewers now that desktop/web is the only target; mobile compatibility no longer counts against it.

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

## Additional web candidate with react-diff-view

`react-diff-view` deserves a prototype alongside JayJay now that native mobile rendering is out of
scope. Its published package consumes parsed Git-format patches, supplies split rendering, and
provides an optional single-side selection mode. Unlike JayJay's `DiffView`, this input can come
directly from `jj diff --git` through its `parseDiff` wrapper. Context expansion still requires
complete original text: its utilities insert unchanged lines into hunks; a short patch alone cannot
reveal missing source. [Component documentation][r-guide].

The npm metadata read November 5 reports `3.3.3`, MIT, React `>=16.14.0`, and six direct
dependencies. It is not installed by this investigation. It needs the same scoped CSS prebuild
experiment as JayJay, but no Rust/WASM pipeline for the basic patch view. Syntax/word highlighting,
very large files, and selection performance need testing; its documentation warns that optimized
selection has a cost on extremely large diffs. This is a candidate, not a measured winner.

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
on the left. An owned React DOM renderer can use grid rows inside a shared vertical container. Wrap
policy, horizontal scrolling, copy behavior, and accessibility must be designed together.
Virtualization is useful, but variable-height rows and browser text selection require testing before
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
provenance and update work, and still requires CSS integration. Reusing `jj-diff` beneath an owned
UI is a useful hybrid, but it is not full independence from JayJay's libraries.

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
The runtime behavior of Monaco, desktop DOM mounting, browser selection, and large Show all views
remains to be measured; no speculative timing or memory figures are used here.

## Prototype and decision gates

1. **Deliver the branch launcher experiment first.** Add a desktop History action matching
   `DiffviewOpen 'fork_point(main|@)'`, explicitly scoped to the selected jj repository. Adopt a
   registered Neovim instance for the workspace; launch Neovide otherwise. Test double clicks, stale
   records, startup readiness, paths with spaces, nested repositories, and root/sibling workspace
   isolation. Verify focus independently of RPC success. This needs no web diff engine or
   changed-file-summary RPC.
2. **Handle the selected-change action accurately.** Use pinned endpoints for one-parent changes;
   test merged-parent baselines and temporary-directory lifetime before claiming merge support. Keep
   live external review and immutable in-app review distinct.
3. **Prototype existing browser viewers in an actual Paseo tab.** Compare JayJay's standalone pane
   with `react-diff-view`. Prove generated inline CSS, host React compatibility, text selection,
   copying from one side, wrapped lines, Show all, resizing, and a 10,000-line file. Supply real jj
   data and avoid the full review/storage application in this first comparison.
4. **Choose the long-term renderer from those results.** Prefer the existing web component that
   meets the interaction tests with the smallest stable adapter. Compare Monaco if richer editor
   behavior matters. Build an owned browser renderer only if component constraints justify owning
   alignment and selection. Native phone compatibility is not an acceptance criterion.
5. **Retain an upstream path.** A public Paseo diff component or endpoint-based diff opener could
   eventually replace the web adapter. Keep comparison sessions independent from presentation so
   this remains possible without blocking the immediate Neovide improvement.

The first implementation decision is now editor registration and local GUI launch/focus, with
Neovide confirmed. Renderer and parser dependencies can wait for the browser prototype. No editor
configuration or live instance was changed during this report update.

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
[d-open]: https://github.com/dlyongemallo/diffview-plus.nvim/blob/main/lua/diffview/init.lua
[d-lib]: https://github.com/dlyongemallo/diffview-plus.nvim/blob/main/lua/diffview/lib.lua
[d-adapter]:
  https://github.com/dlyongemallo/diffview-plus.nvim/blob/main/lua/diffview/vcs/adapters/jj/init.lua
[d-doc]: https://github.com/dlyongemallo/diffview-plus.nvim/blob/main/doc/diffview.txt
[n-remote]: https://neovim.io/doc/user/remote.html
[n-neovide]: https://neovide.dev/command-line-reference.html
[r-guide]: https://github.com/otakustay/react-diff-view/blob/master/README.md
