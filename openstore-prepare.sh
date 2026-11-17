#!/bin/bash
# Prepare + (optionally) publish utoutlook to OpenStore
# Usage:
#   ./openstore-prepare.sh 4.0.51     → prépare livraison/ + publishstore/ kit, affiche le récap à montrer à Mathias
#   ./openstore-prepare.sh 4.0.51 --upload "OK"  → upload UNIQUEMENT si Mathias a dit OK (2e arg obligatoire)
#
# Garde-fous (règles Mathias) :
#   - Aucun upload sans OK explicite de Mathias sur le contenu complet
#   - Test device obligatoire avant upload (adb, 0 crash)
#   - L'apikey OpenStore n'est JAMAIS écrite ici : elle doit être passée en env: OPENSTORE_APIKEY=... ./openstore-prepare.sh X --upload "OK"
set -e

VERSION="${1:?Usage: $0 <version> [--upload \"OK\"]}"
UPLOAD_OK="${3:-}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="utoutlook.mathias"
cd "$ROOT"

LIVRAISON="livraison/utoutlook-$VERSION"
KIT="publishstore/utoutlook-$VERSION"
CLICK="utoulookmail/build/aarch64-linux-gnu/app/${APP}_${VERSION}_arm64.click"

echo "=== Préparation livraison $VERSION ==="
mkdir -p "$LIVRAISON" "$KIT/screenshots"

# Copier le click (git add -f plus tard, .click est gitignoré)
cp -f "$CLICK" "$LIVRAISON/${APP}_${VERSION}_arm64.click"

# CHANGELOG.md et README.txt — à rédiger manuellement si pas encore faits
if [ ! -f "$LIVRAISON/CHANGELOG.md" ]; then
  cat > "$LIVRAISON/CHANGELOG.md" <<EOF
# UToutlook Mail $VERSION — Release notes

(changes depuis la dernière release)

Co-worked by Mathias & Vibe — verified and tested by Mathias.
EOF
  echo "CHANGELOG.md généré (à compléter)"
fi
if [ ! -f "$LIVRAISON/README.txt" ]; then
  cat > "$LIVRAISON/README.txt" <<EOF
UToutlook Mail $VERSION — Installation

1. Transférer ${APP}_${VERSION}_arm64.click sur le téléphone
2. adb install ou clickable install

Co-worked by Mathias & Vibe — verified and tested by Mathias.
EOF
  echo "README.txt généré (à compléter)"
fi

# Kit publishstore
cp -f "$CLICK" "$KIT/" 2>/dev/null || true
[ -f "$KIT/whatsnew.txt" ] || echo "(whatsnew $VERSION à rédiger)" > "$KIT/whatsnew.txt"
[ -f "$KIT/metadata.json" ] || echo '{"name":"UToutlook Mail","description":"Outlook pour Ubuntu Touch"}' > "$KIT/metadata.json"

echo ""
echo "=== RÉCAP À MONTRER À MATHIAS (obligatoire avant upload) ==="
echo "Livraison : $LIVRAISON/"
ls -la "$LIVRAISON"
echo "Kit : $KIT/"
ls -la "$KIT"
echo "whatsnew.txt :"
cat "$KIT/whatsnew.txt" 2>/dev/null
echo ""
echo "SHA512 du click :"
sha512sum "$CLICK"

# --- UPLOAD (uniquement si OK explicite passé en arg) ---
if [ "$2" = "--upload" ]; then
  if [ "$UPLOAD_OK" != "OK" ]; then
    echo "ERREUR: upload refusé — il faut passer \"OK\" comme 3e argument (OK explicite de Mathias sur le contenu montré ci-dessus)"
    exit 1
  fi
  if [ -z "$OPENSTORE_APIKEY" ]; then
    echo "ERREUR: OPENSTORE_APIKEY non défini (env var, jamais écrite dans un fichier)"
    exit 1
  fi
  echo "=== Upload OpenStore $VERSION ==="
  curl -sS -X POST "https://open-store.io/api/v3/manage/${APP}/revision?apikey=$OPENSTORE_APIKEY" \
    -H "Expect:" \
    -F "file=@${LIVRAISON}/${APP}_${VERSION}_arm64.click" \
    -F "changelog=<${KIT}/whatsnew.txt"
  echo ""
  echo "=== Vérification store ==="
  curl -sS "https://open-store.io/api/v4/apps/${APP}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('version:', d.get('version'))"
else
  echo ""
  echo "Pour uploader après OK de Mathias :"
  echo "  OPENSTORE_APIKEY=... ./openstore-prepare.sh $VERSION --upload \"OK\""
fi
