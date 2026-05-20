#!/usr/bin/env bash
set -euo pipefail

# Workaround for extract-zip failing to extract Electron's nested frameworks
# on some Node versions (notably Node 26.x on macOS). Re-extracts the cached
# Electron zip using the system `unzip` tool and writes path.txt manually.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_DIR="$ROOT/node_modules/electron"

if [ ! -d "$ELECTRON_DIR" ]; then
  echo "node_modules/electron is missing — run npm install first." >&2
  exit 1
fi

VERSION="$(node -p "require('$ELECTRON_DIR/package.json').version")"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$PLATFORM" in
  darwin) PLAT="darwin"; PATHFILE="Electron.app/Contents/MacOS/Electron" ;;
  linux)  PLAT="linux";  PATHFILE="electron" ;;
  *) echo "Unsupported platform: $PLATFORM" >&2; exit 1 ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
esac

ZIP_NAME="electron-v${VERSION}-${PLAT}-${ARCH}.zip"
CACHE_DIR="$HOME/Library/Caches/electron"
if [ "$PLAT" = "linux" ]; then
  CACHE_DIR="$HOME/.cache/electron"
fi

ZIP_PATH="$(find "$CACHE_DIR" -name "$ZIP_NAME" 2>/dev/null | head -1 || true)"
if [ -z "$ZIP_PATH" ]; then
  echo "Cached zip not found ($ZIP_NAME). Re-run npm install electron to download it." >&2
  exit 1
fi

echo "Extracting $ZIP_PATH → $ELECTRON_DIR/dist"
rm -rf "$ELECTRON_DIR/dist"
mkdir -p "$ELECTRON_DIR/dist"
unzip -q "$ZIP_PATH" -d "$ELECTRON_DIR/dist"

printf '%s' "$PATHFILE" > "$ELECTRON_DIR/path.txt"
echo "Wrote $ELECTRON_DIR/path.txt → $PATHFILE"
echo "Done."
