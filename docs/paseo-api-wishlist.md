# Deferred Paseo plugin API improvements

Recorded November 11, 2026. These are ideas for future upstream work, not changes being made to
Paseo or jj Companion now. Keep the JayJay renderer until a supported alternative is useful enough
to replace it.

## Summary

| Request                                       | Smallest useful Paseo extension                                                     | Assessment                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Open the working-copy file from a diff        | A client navigation action for a normal file tab                                    | Small, focused API addition                                                 |
| Respect the configured monospace size         | Explicit typography CSS variables, or typed appearance values in the SDK            | Small, focused API addition                                                 |
| Use Paseo's diff renderer inside jj Companion | A host-rendered component accepting plugin-supplied parsed diff data                | Moderate SDK integration; no fundamental renderer rewrite appears necessary |
| Match JayJay's context expansion experience   | A context-data contract and gap-expansion controls, or an external Show all control | Additional work; not provided just by exporting the renderer                |

The promising renderer extension is **a presentation component supplied by Paseo**. Opening an
arbitrary Git commit diff tab is a different feature and would not replace our embedded viewer or
our jj comparison semantics.

## 1. Open a working-copy file in a normal Paseo tab

Desired behavior: an icon beside the diff's context controls opens the current file in Paseo's
ordinary file viewer/editor, preserving the jj Companion tab.

The installed SDK's `navigation` exposes workspace, agent, and Electron browser navigation. It has
no file-opening action. The upstream SDK checked on November 11 also lacks one. Internally, Paseo
already has normal file-tab targets and workspace navigation; the missing part is the public plugin
capability.

A possible API, **not available today**, is:

```ts
navigation.openFile({
  workspaceId,
  path,
});
```

The rendering host should be the default; an explicit host could be supported in the same way as the
other navigation actions. Paseo should resolve the workspace, normalize the path, open or focus its
normal file tab, and retain jj Companion. A plugin should not reproduce tab-store logic or depend on
the legacy `?open=` route.

jj Companion would own the jj-specific visibility check:

- Offer the action when a comparison side represents the current working copy: for example, the
  default `fork_point(trunk()|@)` → `@`, selecting `@`, or a linear range ending at `@`.
- Do not treat the first displayed row or a named bookmark as proof that a revision is `@`.
  Historical comparisons should not accidentally open a live file as though it were their source.
- Account for the selected root/nested repository. Use the path on the working-copy side for
  renames; hide the action when that side has no file, including a deletion from the working copy.
- Recheck eligibility when opening after the working copy has moved to another change. The normal
  file tab shows live disk contents, which may be newer than the pinned review.

Acceptance checks: root and nested repositories, spaces/quotes in filenames, additions, deletions,
renames, historical changes, a range ending at `@`, and an agent moving `@` while review stays open.
An older host without the capability should simply have no button.

## 2. Read the configured monospace font size

The font family currently works through `--fontFamily-mono`, with `data-pmono` protecting code from
Paseo's global interface-font rule. The size does not: JayJay falls back to 12px code and 11px
gutters because we do not supply `--jj-diff-font-size`.

Paseo applies `codeFontSize` to `theme.fontSize.code`, independently of the interface size, and
derives its diff line height from it. The public `PluginTheme` currently forwards only colors. The
Unistyles 3.2.4 CSS serializer examined during this investigation emits string theme values, but not
numeric values. A hypothetical `--fontSize-code` reference would therefore not solve this with the
inspected host; it would just keep using a fallback.

Two reasonable extensions:

1. **Smallest web-only change:** deliberately publish documented CSS variables for code font size
   and line height, with units, updated alongside appearance settings. Names such as
   `--paseo-code-font-size` would be new API, not existing variables.
2. **More general SDK change:** expose resolved UI/monospace families, sizes, and relevant line
   heights through typed appearance data. Values should update when preferences or themes change.

Either would let us set JayJay's existing font-size variable without private settings access,
storage scraping, or DOM measurement. Code and gutters should scale together while the toolbar
continues to use interface typography. A future native diff component could consume these values
inside Paseo automatically, but typography exposure would still benefit other plugin content.

Acceptance checks: a size other than 12px, live preference changes, theme switching, changing the
interface size independently, both diff layouts, and wrapped-line alignment.

## 3. Reuse Paseo's diff renderer

### The existing seam

Paseo's internal `DiffDocument` already accepts parsed files as props. Its input includes hunks,
line contents, optional syntax tokens, counts, paths/old paths, and binary/size notices. Git commit
discovery and file-diff fetching happen elsewhere, in `useCommitDiffFiles` and the panel layer.

This is a real separation between **obtaining a comparison** and **displaying one**. The renderer
does not require a Git commit SHA just to draw plugin-supplied hunks. The existing split/unified
layout, wrapping, viewport rendering, selection/copying, and theme handling could be reused.

There are still host dependencies: Unistyles, translations, toast/context-menu services, review
overlays, file-header actions, and a workspace diff cache. The web implementation paints on canvas;
the native implementation uses Skia. These are good reasons to keep the implementation inside Paseo,
exposed through its host component mechanism, rather than copy it into our bundle or publish a
standalone renderer package as a prerequisite.

### Proposed minimum extension

Expose a read-only component from `@getpaseo/plugin/client/ui` that accepts a stable, readonly
parsed-diff model. Conceptually, **not an existing API**:

```tsx
<DiffView files={parsedFiles} layout="split" wrapLines />
```

For the first experiment, jj Companion could pass just the selected file. Paseo's wrapper would use
the user's current fonts, sizes, and syntax palette and satisfy the internal provider/cache
requirements. The plugin would retain its change graph, file list, repository picker, and jj
commands. File-header controls should be optional or configurable so the two layers do not duplicate
toolbars.

The smallest read-only wrapper could adapt to the current internal commit display mode. The public
interface should describe read-only presentation rather than require a plugin to pretend its data
came from a Git commit. A neutral internal mode becomes useful if file actions or more custom
headers are added later.

This needs SDK declarations, a host-runtime export/wrapper, a supported data contract, and tests
inside a real plugin panel. It is more than a one-line export, but the inspected architecture does
not suggest a large renderer rewrite. This assessment comes from source inspection, not a working
integration prototype or an effort estimate validated with Paseo maintainers.

### What jj Companion would still own

- Resolve jj revsets and nested repositories; snapshot and pin comparisons.
- Preserve `jj diff -r` merged-parent semantics for single merge changes and selected ranges.
- Convert `jj diff --git` output to the public hunk model instead of JayJay's aligned rows.
- Supply optional highlighted tokens, or use a separately documented host highlighting facility.
  `DiffDocument` consumes tokens; exposing it alone does not add arbitrary-input highlighting.
- Keep live-file actions separate from historical source paths.

Our comparison backend remains useful whichever renderer we use. Colocation alone is insufficient:
opening a Git commit tab does not express every jj range, merge baseline, or non-colocated repo.

### Context expansion is a separate requirement

The inspected `collapseState` collapses **whole files**, not unchanged regions inside a file.
`DiffDocumentProps` does not provide a missing-context loader or a Show all control for hunk gaps.
It can display the supplied hunks; exporting it does not recover source lines absent from them.

For our current needs, an external **Show all** control could replace short-context hunks with a
complete-context patch from the same pinned comparison. That could make a first prototype useful
without adding native gap expansion. Proper click-to-expand gaps would need a data/interaction
contract and renderer controls. Keep that follow-up separate from the initial wrapper.

### Decision

Keep JayJay today. If revisiting upstream work, request the read-only parsed-data component first,
then test it on one file before migrating. Check side-specific selection/copying, wrapping, theme
and font updates, Show all, long files, renames, binaries, and refresh during agent rewrites.

If Paseo exposes this seam, replacing our renderer looks achievable with an adapter. If the only
offer is Git-SHA navigation, or reuse requires extracting/repackaging the entire canvas/Skia
implementation ourselves, retain JayJay. There is no need to turn this into a new renderer project.

## Evidence and follow-up

Local source inspection used SDK 0.15.0 and the Paseo reference checkout at
`3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2`. SDK file-navigation availability was additionally
checked against upstream `main` on November 11. Recheck APIs and rendering behavior before
implementation.

- [Plugin navigation contract](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/plugin/src/client/contracts.ts)
- [Host navigation adapter](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/plugins/host-navigation-model.ts)
- [Public plugin theme mapping](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/plugins/theme.ts)
- [Appearance application](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/appearance/apply.ts)
- [Unistyles CSS serialization](https://unpkg.com/react-native-unistyles@3.2.4/src/web/css/state.ts)
- [DiffDocument wrapper](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/git/diff-document/index.tsx)
- [DiffDocument props](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/git/diff-document/types.ts)
- [Web surface](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/git/diff-document/surface.web.tsx)
- [Workspace cache/provider](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/git/diff-document/workspace-cache.tsx)
- [Commit diff data fetching](https://github.com/getpaseo/paseo/blob/3ed57e9dd72df4927b08f16859eaf8d4d2d70ac2/packages/app/src/git/use-diff-files.ts)
- [Existing renderer comparison](research/diff-viewer-options.md)

Track implementation status here when any item becomes available upstream. No Paseo fork, SDK
extension, renderer migration, or file-opening button is included in this documentation change.
