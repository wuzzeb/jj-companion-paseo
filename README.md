# jj Companion

jj Companion brings Jujutsu workspaces, commit history, and bookmark management to Paseo.

It creates a jj workspace for every explicit Paseo workspace creation inside a jj repository,
including Local isolation. Git-only repositories and ordinary directories keep Paseo's behavior.

The plugin uses `server.before("workspace.create")` to run `jj workspace add`, then gives Paseo the
resulting directory. Each workspace lives at:

```text
~/projects/paseo-workspaces/<projectname>-<adjective>-<animal>
```

For example, `myproject-quiet-otter`. The jj workspace name and Paseo sidebar title are both
`quiet-otter`; the project prefix is kept only in the directory name. The plugin sets an explicit
title in place of any requested task title, so Paseo's task auto-naming keeps the short jj name.
Names are generated independently of Paseo's workspace ID, with retries on collisions. The source
Paseo project membership and any working subdirectory are preserved. Existing workspaces keep their
names and can still be archived normally.

Local creation and requests without a base share the source workspace's parent revision(s), just
like plain `jj workspace add`. They do not include changes from the source working copy.

In Paseo's Worktree mode, the base picker lists Git branches for colocated projects. The plugin
resolves the selected `refName` (or CLI `baseBranch`) to a commit in the backing Git store and
passes it to `jj workspace add -r`. Qualified refs distinguish local and remote branches; a bare
`main` prefers local main, then origin/main. Remote refs use their locally cached state; the plugin
does not fetch. A missing base fails creation instead of falling back to another revision.

Selecting a base creates a new jj workspace on that commit, without creating a named Git branch or
jj bookmark. Git branch/PR checkout requests remain unsupported. The picker shows Git refs, not
arbitrary jj changes or revset expressions; non-colocated projects may not offer it in the UI.

Requires Paseo 0.12.0 or later, jj 0.46.0 or later, and Git 2.42 or later on the daemon's PATH.
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

The plugin also provides a **jj Companion** history tab in Paseo’s Explorer sidebar. Open it from
the Explorer’s **+** menu, or search for **Open jj history** in the Command Center. It can also be
moved into a regular workspace pane. On compact layouts, open a new workspace tab and choose **jj
Companion**.

The tab shows a commit graph with descriptions, bookmarks, working-copy and workspace labels, and
conflict markers. Select a change to inspect its full description, author, timestamp, and commit ID.
Selection follows a rewritten change when its change ID remains unambiguous. History starts with the
latest 200 visible revisions across all branches; **Load older changes** expands it up to 1,000
revisions. Connections to history outside the loaded rows end in faded stubs.

History refreshes every 10 seconds while the app is active, and the refresh button reloads it
immediately. These reads do not snapshot files or modify jj’s operation log. Working-copy metadata
therefore reflects the latest jj snapshot, rather than unsnapshotted edits on disk. Git-only
repositories and ordinary directories show an empty state. Diff viewing is a future addition.

The history toolbar provides **Create bookmark**, **Tug**, **Push**, and **Fetch**. These shortcuts
act on the workspace’s edited change (`@`), independently of the selected graph row. If `@` is empty
and has one parent, creation and Tug use that parent (`@-`); an empty merge stays at `@`. Actions
snapshot pending files before resolving the tip, so unsnapshotted work is included.

With no branch bookmark, **Create bookmark** suggests the workspace name. Press Enter or choose
**Create bookmark** to create it locally, then use **Push** after reviewing it. **Tug** advances the
nearest bookmarked ancestor to the workspace tip. Automatic discovery excludes immutable and trunk
bookmarks, so it does not pull `main` forward into a feature branch. The branch row shows the branch
bookmark with Tug and Push on the right. If several names qualify, select the branch bookmark once
for both actions; neither action is enabled until a bookmark is selected. With no branch bookmark,
the row offers creation instead. No `tug` alias is required.

**Push** publishes the bookmark at its current position; use Tug first to include newer changes. A
first push automatically tracks the new remote bookmark. If a same-named remote bookmark already
exists and is untracked, Push tracks it first. If that imports a different local target or creates a
conflict, the operation stops for review instead of pushing a different target. **Fetch** runs
`jj git fetch`, updating remote and tracked bookmarks without running a rebase. A single remote is
selected automatically; choose one explicitly when the repository has multiple remotes. Fetch,
**Manage Bookmarks**, and the Git remote selector appear together below History, above the branch
row.

Click, right-click, or long-press a local bookmark chip to open a small Push menu for that exact
bookmark. On desktop, drag a local bookmark chip onto another graph row to move it, including
backwards and sideways. On mobile, the branch selector and toolbar Push provide the common workflow;
tapping a local bookmark also opens its Push menu. Remote bookmark labels are read-only. **Manage
Bookmarks** lists local and remote bookmarks and provides Create and Push actions. The bookmark-plus
icon in change details creates a bookmark on that exact selected change. Rename, deletion, and
tracking management can be done in a jj terminal.

Bookmark operations are serialized across this plugin’s workspaces sharing the same jj repository.
Stale bookmark positions and abandoned drop targets produce an error and refresh the view. Push and
Fetch run as daemon-side jobs with polled status, allowing up to three minutes for network commands.
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

Paseo 0.12 background creation (`paseo workspace create --background`) uses the same jj workspace
creation hook. Background status and caller context are preserved. Cleanup explicitly includes
background workspaces, even when they are hidden from the sidebar.

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

For Codex agents opened in a jj workspace, the `agent.create` hook adds the shared `.jj` directory,
the common Git directory, and the exact Git worktree directory to
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
