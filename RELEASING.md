# Releasing Lekhini

Lekhini follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(SemVer). This document is the canonical reference for what counts as a
major / minor / patch bump and how to cut a release.

The version shown in **Settings → About** comes from `package.json`, so
the only source of truth for a version number is that file.

## SemVer policy

Given a version `MAJOR.MINOR.PATCH`:

### Major — `X.0.0`

Reserved for changes that meaningfully break what users or downstream
consumers depend on. For a desktop app like Lekhini, that means:

- The persisted state file (`config.json` under the Lekhini user-data
  directory) becomes incompatible
  with the previous schema in a way that hydration can't auto-migrate.
- Hotkey bindings change in a way that removes existing combinations.
- A tool is removed or its on-screen semantics change drastically
  (e.g., "pencil" no longer produces graphite-textured strokes).
- The exported screenshot format / file location changes.

### Minor — `X.Y.0`

Backwards-compatible feature additions or non-trivial UX improvements:

- A new drawing tool / shape.
- A new profile.
- A new setting or persisted preference (with sensible defaults).
- A meaningful change to the rendering engine that improves quality
  without breaking the look of existing strokes.
- New keyboard shortcuts that don't displace existing ones.

### Patch — `X.Y.Z`

Bug fixes and small polish that don't change behavior intentionally:

- Fixing a stroke rendering glitch.
- Fixing a layout / sizing bug.
- Performance improvements.
- Dependency bumps that don't change behavior.
- Documentation-only changes.

## Cutting a release (automated)

Releases are **tag-driven**. One command bumps the version, rolls the
changelog, commits, tags, and pushes — then CI builds every OS and
publishes the GitHub Release. You do not build or upload anything by hand.

1. Make sure the branch is clean and green (`npm run typecheck`, and CI
   on the latest commit is passing). Land all release-worthy changes
   first, with notes under `## [Unreleased]` in `CHANGELOG.md`.
2. Run the release script with the bump type:
   ```bash
   npm run release          # patch (X.Y.Z+1) — the default
   npm run release:minor    # X.Y+1.0
   npm run release:major    # X+1.0.0
   # or an exact version:
   bash scripts/release.sh 1.4.0
   ```
   This (see `scripts/release.sh`):
   - refuses to run on a dirty tree,
   - validates with `npm run prebuild` (typecheck + build),
   - bumps `package.json` + `package-lock.json` (no tag yet),
   - rolls `CHANGELOG.md`: `[Unreleased]` → a dated `[X.Y.Z]` section and
     updates the link refs (`scripts/update-changelog.mjs`),
   - commits `chore(release): vX.Y.Z`, tags `vX.Y.Z`, and pushes both.
3. The pushed tag triggers **`.github/workflows/release.yml`**, which:
   - builds installers on macOS, Windows, and Linux in parallel
     (`npm run release:ci` → `electron-builder --publish always`),
   - uploads them plus the `latest*.yml` update manifests to a **draft**
     GitHub Release for the tag,
   - flips the release **public** once all three OSes succeed.
4. Watch it at <https://github.com/opensourcebharat/lekhini/actions>.
   When green, the release is live and installed apps will auto-update.

### macOS signing (optional)

The workflow signs + notarizes macOS builds **only when** these repo
secrets exist; otherwise the macOS build is unsigned (and macOS
auto-update stays disabled until they're added — Windows/Linux are
unaffected): `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

### Local build (optional)

To produce installers without releasing, use `npm run build` (current
OS) or `npm run build:mac|win|linux`. These write to `release/` and do
**not** publish.

## Auto-update

Installed apps check GitHub Releases via `electron-updater`
(`src/main/updater.ts`), download in the background, and apply on quit.
Users control this in **Settings → Updates** (toggle, manual check,
restart-to-update). Because the feed is GitHub Releases, **every public
release is automatically an update** for existing installs — so prefer
small, frequent patch releases in the early stage.

## Tag naming

- Format: `vMAJOR.MINOR.PATCH` (with leading `v`).
- Pre-releases: `vX.Y.Z-rc.1`, `vX.Y.Z-beta.2`, etc.
- Never re-use a tag. If something breaks immediately after release,
  bump the patch version and ship `vX.Y.(Z+1)` rather than re-tagging.

## Branching

For a small project, `main` is the release branch. Tag releases directly
on `main`. If a hotfix becomes necessary after a release, branch from
the tag (`git checkout -b hotfix-X.Y.Z+1 vX.Y.Z`), apply the fix, tag
and release from there, then merge back into `main`.

## Verifying the released version

After a release, the version shown in **Settings → About** in a fresh
build should match the tag. The CI pipeline should also reject a build
where `package.json` and the current tag disagree (future work — not
yet enforced).
