#!/bin/bash
# Build + install utoutlook sur le téléphone (serial via DEVICE/ADB_DEVICE)
set -e

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./build-deploy.sh [version]"
  echo "  Build l'app Electron (arm64) + clickable build + install sur le device (DEVICE/ADB_DEVICE)"
  echo "  Sans argument, lit la version dans package.json"
  echo "  Exemple: ./build-deploy.sh 4.0.51"
  exit 0
fi

VERSION="${1:-$(grep '"version"' utoulookmail/utoutlookmail/package.json | head -1 | sed 's/.*"version": "//;s/".*//')}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV="${DEVICE:-${ADB_DEVICE:-}}"
cd "$ROOT"

# v4.3.7 (debug device 2026-11-21): electron-builder NE suit PAS un
# node_modules symlinké pour les dépendances transitives. Résultat : l'asar
# ne contenait que `electron-store` (dépendance directe) sans `conf` /
# `type-fest` → `ERR_MODULE_NOT_FOUND` au lancement → Electron crashait en
# boucle et le wrapper finissait par afficher nonetwork.qml (faux "pas de
# réseau" alors que la connexion était bonne). On force un vrai dossier
# avant de builder — garde-fou reproductible pour tous les workspaces.
NODE_MODULES="$ROOT/utoulookmail/utoutlookmail/node_modules"
if [ -L "$NODE_MODULES" ]; then
  echo "=== node_modules est un symlink — copie réelle avant build ==="
  NM_TARGET="$(readlink -f "$NODE_MODULES")"
  rm "$NODE_MODULES"
  cp -a "$NM_TARGET" "$NODE_MODULES"
fi

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
[ -n "$DEV" ] || { echo "ERREUR: définir DEVICE=<serial> (ou ADB_DEVICE)"; exit 1; }
adb -s "$DEV" shell 'click info utoutlook.mathias | grep version'
echo "=== Fait : $VERSION ==="
