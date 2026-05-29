// Roll CHANGELOG.md for a release: move the "[Unreleased]" heading down
// into a new dated "[VERSION]" section (leaving Unreleased empty for the
// next cycle) and update the link references at the bottom of the file.
// Invoked by scripts/release.sh with the freshly-bumped version.
//
// Usage: node scripts/update-changelog.mjs <version>

import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/update-changelog.mjs <version>');
  process.exit(1);
}

const REPO = 'https://github.com/opensourcebharat/lekhini';
const path = new URL('../CHANGELOG.md', import.meta.url);
let md = readFileSync(path, 'utf8');

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

const UNRELEASED = '## [Unreleased]';
if (!md.includes(UNRELEASED)) {
  console.error('CHANGELOG.md has no "## [Unreleased]" section.');
  process.exit(1);
}

// 1. Insert the dated version heading just below [Unreleased], keeping
//    an empty Unreleased section at the top.
md = md.replace(UNRELEASED, `${UNRELEASED}\n\n## [${version}] — ${today}`);

// 2. Find the previous version from the existing Unreleased compare link
//    so we can build a proper compare range for the new one.
const prevMatch = md.match(
  /\[Unreleased\]:\s*\S+\/compare\/v(\d+\.\d+\.\d+(?:-[\w.]+)?)\.\.\.HEAD/,
);
const prev = prevMatch ? prevMatch[1] : null;

// 3. Repoint [Unreleased] at the new version and add the version link.
md = md.replace(/\[Unreleased\]:.*$/m, `[Unreleased]: ${REPO}/compare/v${version}...HEAD`);
const versionLink = prev
  ? `[${version}]: ${REPO}/compare/v${prev}...v${version}`
  : `[${version}]: ${REPO}/releases/tag/v${version}`;
md = md.replace(/(\[Unreleased\]:.*$)/m, `$1\n${versionLink}`);

writeFileSync(path, md);
console.log(`CHANGELOG.md rolled for v${version} (${today}).`);
