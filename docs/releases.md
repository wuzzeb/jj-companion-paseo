# Releases

The package is `paseo-jj-companion`; its initial version is `0.1.0`. This guide describes publishing
it, but no package, tag, or GitHub Release has been published as part of adding the workflow.

## Recommended process

Keep version selection in a reviewed change, create the version tag and release notes in GitHub,
then manually run [Publish to npm](../.github/workflows/publish.yml) for that tag. For this
single-package project, that keeps releases explicit without a bot committing back to `main`.

1. Update `package.json` to the intended version, describe the changes, and merge the change. The
   first release can keep `0.1.0`. For later releases, edit the version directly or use
   `npm version patch --no-git-tag-version --package-lock=false` (substitute `minor`, `major`, or an
   explicit version as needed).
2. In GitHub's **Releases → Draft a new release**, create a tag matching the version, such as
   `v0.1.0`, targeting the reviewed commit. Generate release notes and edit them for users. Keeping
   a draft does not publish to npm.
3. Publish the GitHub Release to create the tag, then choose **Actions → Publish to npm → Run
   workflow** on `main` and enter that tag. The workflow checks out the tag, verifies the version,
   installs pinned dependencies and jj, runs formatting/type/lint/test checks, and checks the npm
   tarball before publishing that same tarball. Stable versions use `latest`; versions such as
   `0.2.0-beta.1` use `next`. Also mark those versions as prereleases in GitHub.
4. Check the Actions result and the npm package page. A GitHub Release can exist even if npm
   publishing fails. Fix setup errors and rerun the failed job, or use **Actions → Publish to npm →
   Run workflow** with the existing tag. A published npm version cannot be overwritten; a code fix
   needs a new version and tag.

The workflow has read-only repository access and an OIDC identity for npm; it does not change
versions or push commits or tags. It serializes publishing runs. Paseo compiles the TypeScript
sources on installation, so there is no separate distributable build step. The published package
includes the manifest, overview, source, vendored licenses, and the pnpm lockfile/workspace settings
needed by the manifest's dependency-install command. It excludes tests and repository tooling.

npm excludes root `pnpm-lock.yaml` files even when listed in `files`. The `prepack` script copies
the tracked lockfile to the generated `install-lock.yaml`, which is included in the tarball. The
manifest restores it to `pnpm-lock.yaml` before the frozen install. GitHub checkouts use the tracked
lockfile directly. There is only one maintained dependency lockfile.

## npm setup and first publication

[Trusted publishing](https://docs.npmjs.com/trusted-publishers/) uses GitHub's OIDC identity instead
of a stored npm token. It requires npm 11.5.1 or later and Node.js 22.14.0 or later; the workflow
uses Node.js 24. The npm package's `repository.url` must match this GitHub repository.

npm requires the package to exist before configuring a trusted publisher. For a brand-new package,
bootstrap the initial `0.1.0` publication from the reviewed checkout using your npm account with 2FA
enabled. Check name availability and ownership on npm before publishing; the local package name does
not reserve it.

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
npm pack --dry-run
npm login
npm publish --access public --tag latest
```

These are instructions for the maintainer to run when ready, not commands run by the workflow setup.
The first manual publication does not have GitHub Actions provenance. Alternatively,
[staged publishing](https://docs.npmjs.com/staged-publishing/) supports creating a new package with
`npm stage publish --access public --tag latest` (npm 11.15.0 or later), then reviewing and
approving it on npm with 2FA. Staging a new package creates a public `0.0.0-stage` placeholder
before approval.

After the initial version is published:

1. Create a GitHub environment named `release` in this repository. Restrict it to release tags if
   desired; account for manual retries running the workflow from `main`.
2. On npm, open **paseo-jj-companion → Settings → Trusted publishing** and add GitHub Actions:
   - Organization or user: `wuzzeb`
   - Repository: `jj-companion-paseo`
   - Workflow filename: `publish.yml`
   - Environment: `release`
   - Allow direct publishing with `npm publish` (stage-only permission will reject this workflow).
3. Configure it when the next release is ready: newly configured publishers must complete their
   first successful publication within two days or be recreated. No `NPM_TOKEN` secret is needed.
4. Create the initial GitHub Release with tag `v0.1.0` and release notes. Since `0.1.0` was already
   published during bootstrap, do not run the publishing workflow for it. Subsequent versions follow
   the normal process above and get automatic provenance from OIDC.

## Paseo registry

The [Paseo registry](https://github.com/getpaseo/plugins#submit-a-plugin) accepts both npm artifacts
and Git commits. npm is a good fit here because its registry bot opens update PRs for new npm
versions; Git updates require a new submission or a manual registry change. Registry users receive
the reviewed, pinned version, so an npm release is not immediately a registry update.

After publishing, submit `paseo-jj-companion@0.1.0` through the registry's submission form, choosing
appropriate categories. `OVERVIEW.md` is included beside `paseo-plugin.json` because the registry
uses it for the plugin page rather than automatically using the README. Direct GitHub installation
remains available.

## Other release-process options

| Option                                                                | Release decision                                                              | Tradeoff                                                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed version change + manual publishing (recommended now)         | Run Actions for an existing version tag                                       | Small setup, explicit control, no repository writes from CI; version and notes remain manual.                                                               |
| Manual version-bump workflow, like immutable-collections              | Select patch/minor/major in Actions                                           | Convenient, but the bot writes release commits/tags and must handle branch protection, concurrent changes, and recovery between npm publishing and pushing. |
| [Release Please](https://github.com/googleapis/release-please-action) | Merge a generated release PR                                                  | Automates versions and changelogs from Conventional Commits; adds bot configuration and commit-message conventions.                                         |
| [Changesets](https://github.com/changesets/changesets)                | Review release notes/version intent with each change, then merge a version PR | Good when several contributors or packages need coordinated releases; adds a CLI dependency and changeset files to maintain.                                |

The immutable-collections workflow already uses OIDC and a release environment; keep those ideas.
Its npm publication happens before pushing the generated commit/tag, so a push failure can leave a
published package without the corresponding remote source tag. Moving the version change into normal
review removes that failure window and works naturally with local jj changes.

To remove the extra Actions click later, add `release: { types: [published] }` as a trigger and use
the release event's tag. Publishing a GitHub Release then becomes the manual release decision. The
current workflow only runs when explicitly dispatched.

If adopting Release Please later, publish from its `release_created` output or explicitly dispatch
the publisher. Releases created with GitHub's default `GITHUB_TOKEN` do not trigger a separate
`release` workflow. See its
[workflow-trigger guidance](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs).

Staged publishing is also an independent option for any release process: replace the final
`npm publish` with `npm stage publish` and approve the artifact on npm. That adds a second manual
step after creating the GitHub Release; the current workflow uses direct trusted publishing.
