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

## Cutting a release

1. Make sure `main` is green: `npm run typecheck` and `npm run build`
   succeed locally. CI on the release commit must also be green.
2. Decide the version bump (major / minor / patch) per the policy above.
3. Update `CHANGELOG.md`:
   - Move items from `[Unreleased]` into a new versioned section.
   - Add a dated heading: `## [X.Y.Z] — YYYY-MM-DD`.
   - Update the link references at the bottom of the file.
4. Bump `package.json`'s `version` field to the new version. Do NOT
   use `npm version` if your workflow doesn't also tag — keep these
   steps explicit.
5. Commit:
   ```
   git add CHANGELOG.md package.json package-lock.json
   git commit -m "chore: release vX.Y.Z"
   ```
6. Tag the commit:
   ```
   git tag -a vX.Y.Z -m "Lekhini vX.Y.Z"
   ```
7. Push commit and tag:
   ```
   git push origin main
   git push origin vX.Y.Z
   ```
8. Build the installers (signed where applicable):
   ```
   npm run build:mac      # produces release/Lekhini-X.Y.Z-arm64.dmg
   npm run build:win      # produces release/Lekhini Setup X.Y.Z.exe
   npm run build:linux    # produces release/Lekhini-X.Y.Z.AppImage
   ```
9. Create a GitHub Release from the `vX.Y.Z` tag:
   - Title: `vX.Y.Z`
   - Body: copy the relevant CHANGELOG section.
   - Attach the installers from step 8.

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
