#!/bin/bash
# Build + install utoutlook sur le téléphone (adb XXXX)
set -e

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./build-deploy.sh [version]"
  echo "  Build l'app Electron (arm64) + clickable build + install sur le device adb XXXX"
  echo "  Sans argument, lit la version dans package.json"
  echo "  Exemple: ./build-deploy.sh 4.0.51"
  exit 0
fi

VERSION="${1:-$(grep '"version"' utoulookmail/utoutlookmail/package.json | head -1 | sed 's/.*"version": "//;s/".*//')}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# v4.0.110: supprimer les anciens .click du dossier de build AVANT de
# reconstruire. clickable garde toutes les versions (103 fichiers, ~10 Go ici)
# et ne prends que le plus récent — nettoyer évite l'encombrement. Les .click
# de livraison/ ne sont PAS touchés (ils sont committés localement).
echo "=== Nettoyage des anciens .click de build ==="
find "$ROOT/utoulookmail/build" -type f -name '*.click' -delete 2>/dev/null || true

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
adb -s XXXX shell 'click info utoutlook.mathias | grep version'
echo "=== Fait : $VERSION ==="
