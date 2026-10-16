# paseo-jj-workspace-plugin

Creates a jj workspace for every explicit Paseo workspace creation inside a jj repository, including
Local isolation. Git-only repositories and ordinary directories keep Paseo's behavior.

The plugin uses `server.before("workspace.create")` to run `jj workspace add`, then gives Paseo the
resulting directory. Each workspace lives at:

```text
~/projects/paseo-workspaces/<projectname>-<adjective>-<animal>
```

For example, `myproject-quiet-otter`. The jj workspace name is just `quiet-otter`; the project
prefix is kept only in the directory name. Names are generated independently of Paseo's workspace
ID, with retries on collisions. The source Paseo project membership and any working subdirectory are
preserved. Existing workspaces keep their names and can still be archived normally.

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

Requires Paseo 0.11.2 or later, jj 0.46.0 or later, and Git 2.42 or later on the daemon's PATH.
Colocation follows jj's defaults: a colocated source and `git.colocate = true` produce a Git
worktree alongside the jj workspace. Non-colocated sources remain non-colocated. Paths refer to the
machine running the Paseo daemon.

Install the directory:

```bash
paseo plugin install /absolute/path/to/paseo-jj-workspace-plugin
```

Paseo must have plugins enabled (`pluginsEnabled: true` in its config). Reload after editing:

```bash
paseo plugin reload jj-workspace
```

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
PowerShell on Windows. Output appears in `paseo plugin logs jj-workspace`.

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
`.jj/paseo-jj-workspace-plugin.json`, outside the tracked files. Unmarked workspaces and directories
outside the managed root are retained.

Archive events are best effort. A missed event or failed removal leaves the directory behind;
failures appear in `paseo plugin logs jj-workspace`. There is no automatic retry after a missed
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
