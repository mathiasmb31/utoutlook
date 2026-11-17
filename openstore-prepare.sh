#!/bin/bash
# Prepare + (optionally) publish utoutlook to OpenStore
set -e

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./openstore-prepare.sh <version> [--upload "OK"]"
  echo ""
  echo "  ./openstore-prepare.sh 4.0.51"
  echo "    → prépare livraison/ + publishstore/ kit, affiche le récap à montrer à Mathias"
  echo ""
  echo "  OPENSTORE_APIKEY=... ./openstore-prepare.sh 4.0.51 --upload "OK""
  echo "    → upload UNIQUEMENT si Mathias a dit OK explicitement (3e arg obligatoire)"
  echo ""
  echo "Garde-fous (règles Mathias) :"
  echo "  - Aucun upload sans OK explicite de Mathias sur le contenu complet"
  echo "  - Test device obligatoire avant upload (adb, 0 crash)"
  echo "  - L'apikey OpenStore n'est JAMAIS écrite dans un fichier : env var uniquement"
  exit 0
fi

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

# whatsnew.txt : généré automatiquement depuis les commits git depuis la dernière version publiée sur OpenStore
LAST_PUBLISHED=$(curl -sS --max-time 10 "https://open-store.io/api/v4/apps/${APP}" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['data'].get('version',''))" 2>/dev/null || echo "")
if [ -z "$LAST_PUBLISHED" ]; then LAST_PUBLISHED="4.0.40"; echo "(API injoignable, fallback sur $LAST_PUBLISHED)"; fi
echo "Dernière version publiée sur OpenStore: $LAST_PUBLISHED"

# Commits depuis le commit de la dernière version publiée (cherché dans les messages de commit)
LAST_COMMIT=$(git log --oneline --grep="Version $LAST_PUBLISHED" -1 --format="%H" 2>/dev/null || git log --oneline --grep="v$LAST_PUBLISHED" -1 --format="%H" 2>/dev/null || echo "")
if [ -z "$LAST_COMMIT" ]; then
  echo "(commit de $LAST_PUBLISHED non trouvé, whatsnew depuis 20 derniers commits)"
  RANGE="HEAD~20..HEAD"
else
  RANGE="${LAST_COMMIT}..HEAD"
fi

{
  echo "Version $VERSION — $(date +"%d %B %Y")"
  echo ""
  echo "Changes since $LAST_PUBLISHED:"
  echo ""
  git log "$RANGE" --format="- %s" 2>/dev/null | sed 's/ — Tests [0-9/]*\. Version [0-9.]*\.//; s/Tests [0-9/]*\. Version [0-9.]*\.//' | head -40
  echo ""
  echo "Co-worked by Mathias & Vibe — verified and tested by Mathias."
} > "$KIT/whatsnew.txt"
echo "whatsnew.txt généré depuis $LAST_PUBLISHED ($RANGE)"

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
