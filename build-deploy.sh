#!/bin/bash
# Build + install utoutlook sur le téléphone (adb 57606579)
set -e

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./build-deploy.sh [version]"
  echo "  Build l'app Electron (arm64) + clickable build + install sur le device adb 57606579"
  echo "  Sans argument, lit la version dans package.json"
  echo "  Exemple: ./build-deploy.sh 4.0.51"
  exit 0
fi

VERSION="${1:-$(grep '"version"' utoulookmail/utoutlookmail/package.json | head -1 | sed 's/.*"version": "//;s/".*//')}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Build utoutlook $VERSION ==="
cd utoulookmail/utoutlookmail
rm -rf dist/linux-arm64-unpacked
export TMPDIR="${TMPDIR:-/home/mathias/.cache/tmp-electron-build}"
mkdir -p "$TMPDIR"
export ELECTRON_CACHE="${ELECTRON_CACHE:-$HOME/.cache/electron}"
npx electron-builder --arm64 -l tar.gz --publish never
cd ..

echo "=== Clickable build ==="
clickable build --arch arm64

echo "=== Install sur device ==="
clickable install

echo "=== Vérification ==="
adb -s 57606579 shell 'click info utoutlook.mathias | grep version'
echo "=== Fait : $VERSION ==="
