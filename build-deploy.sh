#!/bin/bash
# Build + install utoutlook sur le téléphone (adb 57606579)
# Usage: ./build-deploy.sh [version]
# Exemple: ./build-deploy.sh 4.0.51
set -e

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
