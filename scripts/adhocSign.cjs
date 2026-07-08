// electron-builder afterPack hook: ad-hoc sign the macOS bundle.
//
// When no Developer ID certificate is configured, electron-builder skips
// bundle signing entirely. The resulting .app carries only the linker
// signature of the raw Electron binary (Identifier=Electron, Info.plist
// not bound, no sealed resources) — it has no coherent code identity.
// macOS TCC keys permission grants (Screen Recording etc.) to the app's
// code identity, so grants against such a bundle never match the running
// process: the user toggles the permission ON and the app still can't
// capture. Ad-hoc signing the whole bundle gives it a valid identity
// (identifier from CFBundleIdentifier, sealed resources), which TCC can
// track — the grant then sticks for that installed build.
//
// This hook runs BEFORE electron-builder's own signing step, so on a
// properly configured build the Developer ID signature simply replaces
// the ad-hoc one. Note ad-hoc identity is per-build (cdhash), so users
// of unsigned builds must re-grant Screen Recording after each update —
// real signing (see RELEASING.md) is the actual fix.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
  console.log(`  • ad-hoc signed ${appPath}`);
};
