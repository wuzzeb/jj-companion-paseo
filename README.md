# paseo-jj

Creates a jj workspace for every explicit Paseo workspace creation inside a jj repository,
including Local isolation. Git-only repositories and ordinary directories keep Paseo's behavior.

The plugin uses `server.before("workspace.create")` to run `jj workspace add`, then gives Paseo
the resulting directory. Each workspace lives at:

```text
~/projects/paseo-workspaces/<projectname>-<adjective>-<animal>
```

For example, `myproject-quiet-otter`. That directory name is also the jj workspace name.
Names are generated independently of Paseo's workspace ID, with retries on collisions.
The source Paseo project membership and any working subdirectory are preserved.

Local creation and requests without a base share the source workspace's parent revision(s),
just like plain `jj workspace add`. They do not include changes from the source working copy.

In Paseo's Worktree mode, the base picker lists Git branches for colocated projects. The plugin
resolves the selected `refName` (or CLI `baseBranch`) to a commit in the backing Git store and
passes it to `jj workspace add -r`. Qualified refs distinguish local and remote branches; a bare
`main` prefers local main, then origin/main. Remote refs use their locally cached state; the plugin
does not fetch. A missing base fails creation instead of falling back to another revision.

Selecting a base creates a new jj workspace on that commit, without creating a named Git branch
or jj bookmark. Git branch/PR checkout requests remain unsupported. The picker shows Git refs,
not arbitrary jj changes or revset expressions; non-colocated projects may not offer it in the UI.

Requires Paseo 0.11.2 or later, jj 0.46.0 or later, and Git 2.42 or later on the daemon's PATH.
Colocation follows jj's defaults: a colocated source and `git.colocate = true` produce a Git
worktree alongside the jj workspace. Non-colocated sources remain non-colocated.
Paths refer to the machine running the Paseo daemon.

Install the directory:

```bash
paseo plugin install /absolute/path/to/paseo-jj
```

Paseo must have plugins enabled (`pluginsEnabled: true` in its config). Reload after editing:

```bash
paseo plugin reload paseo-jj
```

Archiving runs `jj workspace remove` after checking that no other active Paseo workspace uses
the directory, including subdirectories and background workspaces. jj snapshots the working-copy
state, removes the workspace and its Git worktree registration, and deletes the directory.
Ignored files are deleted too; jj does not preserve them in that snapshot. Ownership is recorded
in `.jj/paseo-jj.json`, outside the tracked files. Unmarked workspaces and directories outside
the managed root are retained.

Archive events are best effort. A missed event or failed removal leaves the directory behind;
failures appear in `paseo plugin logs paseo-jj`. There is no automatic retry after a missed event.
If ownership-marker creation fails, the plugin attempts to remove its new jj workspace immediately.
A later Paseo failure can still leave an orphan: the before-hook has no callback for that failure.
Such workspaces require manual cleanup; the plugin does not run an orphan sweep.
Paseo's restore action does not recreate a directory removed by this plugin.

Paseo limits hook invocations to 30 seconds. The plugin passes the cancellation signal to jj,
and caps each jj command at 25 seconds. These limits can interrupt creation in a large repository;
partially created workspaces may require manual cleanup.

This plugin only intercepts explicit workspace creation; opening an existing workspace and bare
`paseo run` do not run this hook. Colocated workspaces expose Git status and diffs, while Git
branch and PR workflows retain the limitations of jj's detached Git HEAD.

For development (Node.js 22 or later, plus jj):

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

The `paseo/` directory is an ignored reference checkout, not part of the plugin.
