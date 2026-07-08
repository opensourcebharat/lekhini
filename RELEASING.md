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

### macOS signing & notarization

The workflow signs + notarizes macOS builds **only when** the repo
secrets below exist; otherwise the macOS build is unsigned. **Unsigned
builds are effectively unusable for end users**: macOS quarantines every
browser download, and Gatekeeper then shows *"Apple could not verify
'Lekhini' is free of malware"* or *" 'Lekhini' is damaged and can't be
opened"* — the file is fine, but macOS refuses to run it. Signing +
notarization is what removes those dialogs (and it also unlocks macOS
auto-update, which Squirrel.Mac refuses for unsigned apps).

One-time setup (needs an [Apple Developer Program](https://developer.apple.com/programs/)
membership, US$99/year, on the org's Apple ID):

1. **Create a "Developer ID Application" certificate.**
   Easiest via Xcode: *Xcode → Settings → Accounts → (your Apple ID) →
   Manage Certificates… → + → Developer ID Application*. Alternatively
   create it at
   [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
   using a CSR from Keychain Access (*Certificate Assistant → Request a
   Certificate from a Certificate Authority*).
2. **Export it as a `.p12`.** In Keychain Access, find the
   `Developer ID Application: …` certificate (expand it so the private
   key is included), right-click → *Export*, format *Personal
   Information Exchange (.p12)*, and set a strong export password.
3. **Get an app-specific password** for notarization:
   [account.apple.com](https://account.apple.com) → *Sign-In and
   Security → App-Specific Passwords → +*.
4. **Find your Team ID**: [developer.apple.com/account](https://developer.apple.com/account)
   → *Membership details* (10-character ID like `AB12CD34EF`).
5. **Set the five repo secrets** (from the repo root):
   ```bash
   base64 -i DeveloperID.p12 | gh secret set CSC_LINK --repo opensourcebharat/lekhini
   gh secret set CSC_KEY_PASSWORD --repo opensourcebharat/lekhini --body 'the .p12 export password'
   gh secret set APPLE_ID --repo opensourcebharat/lekhini --body 'appleid@example.com'
   gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo opensourcebharat/lekhini --body 'xxxx-xxxx-xxxx-xxxx'
   gh secret set APPLE_TEAM_ID --repo opensourcebharat/lekhini --body 'AB12CD34EF'
   ```
6. **Cut a release** (any bump). The workflow detects `CSC_LINK`, signs
   with the hardened runtime + entitlements, notarizes with Apple, and
   staples the ticket. Verify a downloaded artifact with:
   ```bash
   spctl -a -vv /Applications/Lekhini.app   # → "accepted, source=Notarized Developer ID"
   ```

Until the secrets exist, the release workflow prints an **"Unsigned
macOS build"** warning in the run summary. Users stuck with an unsigned
build can bypass Gatekeeper at their own discretion with
`xattr -cr /Applications/Lekhini.app` — a stopgap, not a fix.

### Windows signing (future)

Windows builds are currently unsigned, so SmartScreen shows
"Windows protected your PC" until enough reputation accrues. Fixing
that requires an OV/EV code-signing certificate or
[Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/);
electron-builder supports both once credentials exist. Linux needs no
signing.

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
