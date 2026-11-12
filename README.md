# jj Companion

jj Companion brings Jujutsu workspaces, commit history, and bookmark management to Paseo.

It follows Paseo's isolation picker: **Local** uses the selected directory without creating a jj
workspace; **New worktree** creates a jj workspace inside a jj repository, based on the selected Git
branch. Git-only repositories and ordinary directories keep Paseo's behavior.

The plugin uses `server.addHook("workspace.create.before")` to run `jj workspace add`, then gives
Paseo the resulting directory. Paseo 0.15's `worktree.create.before` hook changes Git creation
options but still requires Paseo to run `git worktree add`; it cannot replace creation with
`jj workspace add`. The plugin therefore keeps jj creation in `workspace.create.before`, including
its own awaited setup. Paseo's `worktree.create.after` hook and built-in `.worktreeinclude` copying
do not run for these jj workspaces. Use `worktree.setup` to copy any local files they need.

Each workspace lives at:

```text
~/projects/paseo-workspaces/<projectname>-<adjective>-<animal>
```

For example, `myproject-quiet-otter`. The jj workspace name and Paseo sidebar title are both
`quiet-otter`; the project prefix is kept only in the directory name. The plugin sets an explicit
title in place of any requested task title, so Paseo's task auto-naming keeps the short jj name.
Names are generated independently of Paseo's workspace ID, with retries on collisions. The source
Paseo project membership and any working subdirectory are preserved. Existing workspaces keep their
names and can still be archived normally.

New worktree requests without a base share the source workspace's parent revision(s), just like
plain `jj workspace add`. They do not include changes from the source working copy. Local uses the
existing working copy, including its uncommitted changes, and does not run the plugin's setup
commands.

In Paseo's Worktree mode, the base picker lists Git branches for colocated projects. The plugin
resolves the selected `refName` (or CLI `baseBranch`) to a commit in the backing Git store and
passes it to `jj workspace add -r`. Qualified refs distinguish local and remote branches; a bare
`main` prefers local main, then origin/main. Remote refs use their locally cached state; the plugin
does not fetch. A missing base fails creation instead of falling back to another revision.

Selecting a base creates a new jj workspace on that commit, without creating a named Git branch or
jj bookmark. Git branch/PR checkout requests remain unsupported. The picker shows Git refs, not
arbitrary jj changes or revset expressions; non-colocated projects may not offer it in the UI.

Requires Paseo 0.15.0 or later, jj 0.46.0 or later, and Git 2.42 or later on the daemon's PATH.
Colocation follows jj's defaults: a colocated source and `git.colocate = true` produce a Git
worktree alongside the jj workspace. Non-colocated sources remain non-colocated. Paths refer to the
machine running the Paseo daemon.

Install dependencies from the plugin directory, then install it in Paseo. The protocol config parser
is bundled from the local dependencies when Paseo compiles the plugin:

```bash
pnpm install --frozen-lockfile
paseo plugin install /absolute/path/to/paseo-jj-companion
```

Paseo must have plugins enabled (`pluginsEnabled: true` in its config). Reload after editing:

```bash
paseo plugin reload jj-companion
```

On the experimental `jayjay-review-tab` branch, **Open jj review** in Paseo's Command Center opens
one **jj Review** workspace tab on desktop/web. The change graph is on the left, changed files in
the middle, and the side-by-side diff on the right. This replaces the separate Explorer history
panel.

Click a change to immediately review it. Its full description, author, timestamp, and IDs appear
above the code, from the same pinned snapshot as the diff. Shift-click another change to immediately
review an inclusive linear range; a normal click returns to a single change. Ranges cannot cross
branches or merges. Individual merge changes use jj's merged-parent baseline. **Diff**, beside
**Tug** and **Push** in the branch row, returns to `fork_point(main|@)` → `@`. The active comparison
appears above the diff; a single change shows its description and metadata there instead.

The **Changes** heading contains the repository selector when needed and a small refresh icon. There
is no separate top toolbar; hover an icon control to see its action.

If the jj root has immediate child directories containing their own `.jj` directory, a repository
selector appears beside **Changes**. It lists the root first, followed by child repositories by
name, including ignored checkouts and separately created jj workspaces. Discovery goes one level
deep and skips directory symlinks. The graph, bookmarks, Fetch, Push, files, and diff all follow
this selection. Switching repositories returns to its branch comparison and resets the history
depth. Refresh rescans the available repositories.

The graph shows descriptions, bookmarks, working-copy and workspace labels, and conflicts. History
keeps each branch's stack together, with the current workspace's stack first, using jj's graph
ordering. Children appear before their parents, including at forks and merges. It initially shows
200 revisions across all branches; **Load older changes** expands it up to 1,000 revisions. Graph
connections outside the loaded rows end in faded stubs. The review tab remembers its repository,
comparison, selected file, and history depth across app reloads using Paseo's persisted tab state.

Drag the dividers between Changes, Files, and the diff to resize the two left columns. Widths are
saved with the review tab across reloads and constrained to leave room for the diff. Closing the tab
and opening a new one uses the defaults. Double-click a divider to restore its responsive default
width. Focus a divider and use Left/Right to adjust by 10 pixels (Shift for 50), or Home/End for its
minimum/maximum width.

History and bookmarks refresh every 10 seconds while the app is active. These reads do not snapshot
files or modify jj's operation log, and do not change the pinned diff or description. Click a row
again or use **Refresh** to reopen a comparison against current revisions. Unambiguous rewrites are
followed when resolving selected changes. Git-only repositories and ordinary directories show an
empty state.

Click a collapsed context row or the expand-context icon in the file header to reveal the complete
file; the same icon collapses unchanged regions again. Use the adjacent inline/side-by-side icon to
toggle the diff layout; the choice is saved with the review tab. Mouse selections copy code without
line numbers, and stay within one column in side-by-side mode. Code uses Paseo's configured
monospace/terminal font, including live preference changes; interface labels keep the interface
font.

Use the tree/list icon above the changed files to switch between full paths and a collapsible
directory tree. The choice is saved with the review tab. Tree folders start expanded; file status,
selection, and rename tooltips are available in both views.

Opening a comparison or pressing **Refresh** snapshots edits and pins the jj operation and the
comparison's concrete commit IDs. Browsing files and revealing context keep that snapshot, so agent
changes appear only after Refresh. Syntax highlighting uses Paseo's language parsers and follows its
configured syntax colors live. Unsupported languages and files over the highlighter's 768 KiB source
budget per side use plain text. Word highlighting is not included. Binary files and
path/permission-only changes show notices. Comments and review marks are not included. Files are
limited to 20,000 diff lines and jj's 16 MiB output limit; revsets may select up to 1,000 changes.

The small JayJay source subset is vendored under `client/vendor/jayjay` with its Apache-2.0 license
and pinned revision. Styles are embedded in JavaScript; no package installation, worker, WASM build,
or nested checkout is required to load this branch. `tools/vendor-jayjay.mjs` regenerates the subset
from a separate JayJay jj checkout when updating it.

The change-list controls provide **Bookmarks**, **Tug**, **Push**, and **Fetch**. Bookmark creation
and Tug target the workspace’s edited change (`@`), independently of the selected graph row. If `@`
is empty and has one parent, creation and Tug use that parent (`@-`); an empty merge stays at `@`.
Actions snapshot pending files before resolving the tip, so unsnapshotted work is included.

Use **Bookmarks** to create a local bookmark, then **Push** after reviewing it. The branch row’s
**Tug** advances the nearest bookmarked ancestor to the workspace tip. Automatic discovery excludes
immutable and trunk bookmarks, so it does not pull `main` forward into a feature branch. The branch
row shows the branch bookmark with Diff, Tug, and Push on the right. If several names qualify,
select the branch bookmark once for Tug and Push; neither action is enabled until a bookmark is
selected. With no branch bookmark, the row offers **Diff** and **Create Bookmark**. The latter opens
a focused name-only dialog, prefilled with the workspace name. Enter or **Create** creates a local
bookmark at the workspace tip; the dialog closes on success and keeps the name on failure. The
larger **Bookmarks** dialog remains available for all other management. No `tug` alias is required.

**Push** publishes the bookmark at its current position; use Tug first to include newer changes. A
first push automatically tracks the new remote bookmark. If a same-named remote bookmark already
exists and is untracked, Push tracks it first. If that imports a different local target or creates a
conflict, the operation stops for review instead of pushing a different target. **Fetch** runs
`jj git fetch`, updating remote and tracked bookmarks without running a rebase. A single remote is
selected automatically; choose one explicitly when the repository has multiple remotes. Fetch,
**Bookmarks**, and the Git remote selector appear together below Changes, above the branch row.

The change graph is for reviewing diffs: bookmark chips are passive labels, and clicking anywhere on
a row, including its bookmarks, opens that change’s diff. Shift-click extends the selection.

**Bookmarks** lists local and remote bookmarks in one dialog. Local rows offer **Tug** to move that
specific bookmark to the current workspace’s tip, even from another stack, and **Push to** the
selected remote. The dialog stays open while actions run and the list refreshes. Untracked remote
rows offer **Track** for that exact bookmark and remote. With multiple remotes, choose the push
destination inside the dialog; tracking always uses the remote named on its row.

Type a name in the field at the bottom to reveal **Create**, or press Enter. Creation is local at
the current workspace’s tip and keeps the entered name if it fails. Conflicted bookmarks, renaming,
deletion, untracking, and moving to arbitrary revisions are left to the jj CLI.

Bookmark operations are serialized across this plugin’s workspaces sharing the same jj repository.
Stale bookmark positions and workspace changes produce an error and refresh the view. Push and Fetch
run as daemon-side jobs with polled status, allowing up to three minutes for network commands.
Closing the panel does not cancel a job; reloading or disabling the plugin cancels pending work.
Normal jj push checks remain enabled, including description, conflict, and remote-update checks.

Configure repository lifecycle commands in `paseo.json`:

```json
{
  "worktree": {
    "setup": ["node scripts/workspace-setup.mjs"],
    "teardown": "node scripts/workspace-teardown.mjs"
  }
}
```

Both fields accept a command string or an array of commands. The plugin reads `paseo.json` from the
jj workspace root and runs commands sequentially there, even when the selected directory is a
subdirectory. Setup completes before the directory is handed to Paseo, so it can prepare local
configuration before the first agent starts. Commands use non-interactive Bash on Unix and
PowerShell on Windows. Output appears in `paseo plugin logs jj-companion`.

Commands inherit the daemon environment, with these values set by the plugin:

- `PASEO_WORKTREE_PATH`: the new jj workspace root.
- `PASEO_SOURCE_CHECKOUT_PATH`: the source jj checkout used to create the workspace.
- `PASEO_ROOT_PATH`: an alias for `PASEO_SOURCE_CHECKOUT_PATH`.
- `PASEO_BRANCH_NAME`: the jj workspace name, such as `quiet-otter`.

The plugin does not allocate `PASEO_WORKTREE_PORT`. Existing ownership markers without a recorded
source checkout infer it from the shared `.jj/repo` path when running teardown.

If setup fails, creation fails and leaves the marked workspace for inspection and manual cleanup.
The remaining commands are skipped. Teardown runs only after ownership and active-workspace checks
pass, immediately before `jj workspace remove`. If teardown fails, removal stops and the workspace
is retained. Teardown commands should tolerate retries after a partial failure.

Archiving runs `jj workspace remove` after checking that no other active Paseo workspace uses the
directory, including subdirectories and background workspaces. jj snapshots the working-copy state,
removes the workspace and its Git worktree registration, and deletes the directory. Ignored files
are deleted too; jj does not preserve them in that snapshot. Ownership is recorded in
`.jj/paseo-jj-companion.json`, outside the tracked files. Markers created before the rename,
`.jj/paseo-jj-workspace-plugin.json`, are still recognized. Unmarked workspaces and directories
outside the managed root are retained.

Background creation uses the same isolation behavior: directory sources stay Local, and worktree
sources create jj workspaces. Background status and caller context are preserved. Cleanup explicitly
includes background workspaces, even when they are hidden from the sidebar.

Archive events are best effort. A missed event or failed removal leaves the directory behind;
failures appear in `paseo plugin logs jj-companion`. There is no automatic retry after a missed
event. If ownership-marker creation fails, the plugin attempts to remove its new jj workspace
immediately. A later Paseo failure can still leave an orphan: the before-hook has no callback for
that failure. Such workspaces require manual cleanup; the plugin does not run an orphan sweep.
Paseo's restore action does not recreate a directory removed by this plugin.

Paseo limits hook invocations to 30 seconds in total. The plugin passes the cancellation signal to
jj and lifecycle commands, and caps each command at 25 seconds. Keep setup and teardown within that
total budget. These limits can interrupt creation in a large repository; partially created
workspaces may require manual cleanup.

The workspace-creation hook only runs for explicit creation; opening an existing workspace and bare
`paseo run` do not run that hook. Colocated workspaces expose Git status and diffs, while Git branch
and PR workflows retain the limitations of jj's detached Git HEAD.

For development (Node.js 22 or later, plus jj):

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

For Codex agents opened in a jj workspace, the `agent.create.before` hook adds the shared `.jj`
directory, the common Git directory, and the exact Git worktree directory to
`sandbox_workspace_write.writable_roots`. Codex protects a `.git` pointer's destination even when
its parent is writable, so the exact worktree directory is necessary.

Writable-root arrays replace each other in Codex. To preserve configured roots such as pnpm caches,
the hook first reads Codex's effective user/project configuration through a short-lived
`codex app-server` using `config/read`, then unions those roots with per-agent roots and the jj/Git
paths. This starts no thread or model request and edits no configuration files. Other options,
including network access, approval policy, and sandbox mode, are left as configured. Codex must be
on the daemon's PATH. Daemon-wide Paseo provider writable-root defaults are not exposed to this
hook; keep those roots in Codex configuration or per-agent options instead. The merged roots are
saved with the new agent; existing agents need to be recreated to receive them.

The `paseo/` directory is an ignored reference checkout, not part of the plugin.

Deferred upstream requests for file-tab navigation, typography settings, and native diff rendering
are tracked in [Paseo API improvements](docs/paseo-api-wishlist.md).
