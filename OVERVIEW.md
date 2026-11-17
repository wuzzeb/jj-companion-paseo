jj Companion brings Jujutsu workspaces, change history, bookmark management, and diff review to
Paseo. Review a change, a linear range of changes, or your branch's changes in a side-by-side or
inline diff. Browse the change graph, create and move bookmarks, and fetch or push from the review
tab.

Paseo's New worktree picker creates isolated jj workspaces with optional repository setup and
teardown commands. Archiving removes workspaces created by this plugin, including their ignored
files. Setup and teardown commands run on the machine hosting the Paseo daemon.

Requires Paseo 0.16.0 or later with plugins enabled, jj 0.46.0 or later, Git 2.42 or later, and a jj
repository. jj and Git must be on the daemon's PATH for normal use. Installation and updates also
require Node.js 22.12 or later, npm, and pnpm; npm is also used to check for package updates. Normal
plugin operations and reloads do not invoke those installation tools. The review interface works on
desktop and web; it does not include a native mobile diff viewer.

The plugin runs jj commands against your local repositories. Fetch and Push contact your configured
Git remotes using the daemon's credentials. For Codex agents in jj workspaces, it reads Codex's
effective configuration through a local app-server process and adds the shared jj and Git
directories to that agent's writable roots.
