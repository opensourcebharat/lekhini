#!/usr/bin/env bash
set -euo pipefail

# Cut a release: validate, bump the version, roll the CHANGELOG, commit,
# tag, and push. The pushed tag triggers .github/workflows/release.yml,
# which builds macOS / Windows / Linux installers and publishes them to
# GitHub Releases. This script does NOT build installers itself.
#
# Usage:
#   scripts/release.sh [patch|minor|major|<x.y.z>]   (default: patch)
# Or via npm:
#   npm run release          # patch
#   npm run release:minor
#   npm run release:major

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUMP="${1:-patch}"

# 1. Preconditions — clean tree so the release commit is exactly the
#    version + changelog change and nothing else.
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree not clean. Commit or stash changes first." >&2
  exit 1
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "→ Releasing from '$BRANCH' (bump: $BUMP)"

# 2. Validate before tagging anything (typecheck + full vite build).
echo "→ Validating build (npm run prebuild)…"
npm run prebuild

# 3. Bump package.json + lockfile WITHOUT committing or tagging — we do
#    those explicitly so the CHANGELOG lands in the same commit.
npm version "$BUMP" --no-git-tag-version >/dev/null
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
echo "→ New version: $VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "✗ Tag $TAG already exists. Never re-use a tag — bump again." >&2
  exit 1
fi

# 4. Roll CHANGELOG: [Unreleased] → dated [VERSION] section + links.
node scripts/update-changelog.mjs "$VERSION"

# 5. Commit, tag, push. CI takes it from here.
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): $TAG"
git tag -a "$TAG" -m "Lekhini $TAG"
echo "→ Pushing '$BRANCH' and tag '$TAG'…"
git push origin "$BRANCH"
git push origin "$TAG"

echo "✓ $TAG pushed. GitHub Actions will build + publish the release."
echo "  Watch: https://github.com/opensourcebharat/lekhini/actions"
