#!/bin/bash
# Prepare + (optionally) publish utoutlook to OpenStore
# COPIE SYNCHRONISEE dans 4 depots : utoutlook-fix-storm, utoutlook,
# utoutlook-release-4.1.0, vibeworkspace. Toute modif doit y etre reportee.
set -e

# Traduction automatique FR -> EN (API publiques sans clé, fallback MyMemory).
# Lit du texte FR sur stdin, écrit l'anglais sur stdout. Exit 2 si échec.
translate_en() {
  python3 - <<'PYEOF'
import json, sys, urllib.parse, urllib.request
text = sys.stdin.read().strip()
if not text:
    sys.exit(0)
lines = text.splitlines()
def tr_google(chunk):
    q = urllib.parse.quote(chunk)
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=" + q
    with urllib.request.urlopen(url, timeout=20) as r:
        d = json.load(r)
    return ''.join((s[0] or '') for s in d[0])
def tr_mymemory(chunk):
    q = urllib.parse.quote(chunk)
    url = "https://api.mymemory.translated.net/get?q=" + q + "&langpair=fr|en"
    with urllib.request.urlopen(url, timeout=20) as r:
        d = json.load(r)
    return d['responseData']['translatedText']
out = []
CH = 8
for i in range(0, len(lines), CH):
    chunk = '\n'.join(lines[i:i+CH])
    try:
        out.append(tr_google(chunk))
    except Exception:
        try:
            out.append(tr_mymemory(chunk))
        except Exception:
            sys.stderr.write("TRANSLATION_FAILED\n")
            sys.exit(2)
print('\n'.join(out))
PYEOF
}

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./openstore-prepare.sh [version] [--upload OK]"
  echo ""
  echo "  ./openstore-prepare.sh"
  echo "    → version PAR DÉFAUT = dernier click buildé localement, prépare le kit et affiche le récap"
  echo ""
  echo "  ./openstore-prepare.sh 4.3.6"
  echo "    → idem avec une version explicite"
  echo ""
  echo "  OPENSTORE_APIKEY=... ./openstore-prepare.sh --upload OK"
  echo "    → upload: confirmation interactive OBLIGATOIRE + OK explicite + apikey en env var"
  echo ""
  echo "Garde-fous (règles Mathias) :"
  echo "  - Aucun upload sans confirmation interactive tapée à la main"
  echo "  - Aucun upload sans OK explicite de Mathias sur le contenu complet"
  echo "  - Test device obligatoire avant upload (adb, 0 crash)"
  echo "  - L'apikey OpenStore n'est JAMAIS écrite dans un fichier : env var uniquement"
  exit 0
fi

# v4.3.6: résoudre le VRAI chemin du script — le script peut être lancé via
# un lien symbolique depuis un autre worktree (utoutlook/, vibeworkspace/, ...).
# $0 pointe alors vers le lien, et ROOT serait mauvais (click introuvable).
# On résout avec `readlink -f` (script HÔTE, pas dans le click : AppArmor ne
# s'applique pas ici) avec repli builtin sur $0.
_SELF="${BASH_SOURCE[0]}"
case "$_SELF" in
  /*) ;;
  *) _SELF="$PWD/$_SELF" ;;
esac
_REAL="$(readlink -f "$_SELF" 2>/dev/null || echo "$_SELF")"
ROOT="$(cd "$(dirname "$_REAL")" && pwd)"
APP="utoutlook.mathias"
cd "$ROOT"

# --- Parsing des arguments (version optionnelle) ---
VERSION=""
UPLOAD_REQUESTED=0
UPLOAD_OK=""
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD_REQUESTED=1 ;;
    OK) UPLOAD_OK="OK" ;;
    -*) echo "ERREUR: option inconnue '$arg' (voir --help)"; exit 1 ;;
    *) [ -z "$VERSION" ] && VERSION="$arg" ;;
  esac
done

# Version par défaut : dernier click arm64 buildé localement, repli package.json
if [ -z "$VERSION" ]; then
  VERSION=$(ls -1 utoulookmail/build/*/app/"${APP}"_*_arm64.click 2>/dev/null \
    | sed -E "s|.*/${APP}_([0-9]+\.[0-9]+\.[0-9]+)_arm64\.click|\1|" \
    | sort -V | tail -1)
  if [ -z "$VERSION" ]; then
    VERSION=$(grep -m1 '"version"' utoulookmail/utoutlookmail/package.json 2>/dev/null \
      | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
  fi
  [ -n "$VERSION" ] || { echo "ERREUR: impossible de déterminer la version (voir --help)"; exit 1; }
  echo "Version par défaut détectée: $VERSION (dernier click buildé / package.json)"
fi

LIVRAISON="livraison/utoutlook-$VERSION"
KIT="publishstore/utoutlook-$VERSION"
# v4.1.0: glob sur les architectures (revue F24)
CLICK=$(ls -1 utoulookmail/build/*/app/"${APP}_${VERSION}_arm64.click" 2>/dev/null | head -1)

echo "=== Préparation livraison $VERSION ==="
mkdir -p "$LIVRAISON" "$KIT/screenshots"

# Copier le click (git add -f plus tard, .click est gitignoré)
cp -f "$CLICK" "$LIVRAISON/${APP}_${VERSION}_arm64.click"

# CHANGELOG.md et README.txt — à rédiger manuellement si pas encore faits
if [ ! -f "$LIVRAISON/CHANGELOG.md" ]; then
  cat > "$LIVRAISON/CHANGELOG.md" <<EOF
# UToutlook Mail $VERSION — Release notes

(changes since the last release — keep this file in ENGLISH, it is published on the OpenStore)

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
EOF
  echo "CHANGELOG.md généré (à compléter)"
fi
if [ ! -f "$LIVRAISON/README.txt" ]; then
  cat > "$LIVRAISON/README.txt" <<EOF
UToutlook Mail $VERSION — Installation

1. Transfer ${APP}_${VERSION}_arm64.click to the phone
2. adb install or clickable install

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
EOF
  echo "README.txt généré (à compléter)"
fi

# Kit publishstore
# v4.1.0 (revue F15): échouer si le click est absent — le kit ne doit pas paraître prêt.
[ -n "$CLICK" ] && [ -f "$CLICK" ] || { echo "ERREUR: click ${APP}_${VERSION}_arm64.click introuvable — build d'abord"; exit 1; }
cp -f "$CLICK" "$KIT/"

# whatsnew.txt : généré automatiquement depuis les commits git depuis la dernière version publiée sur OpenStore
LAST_PUBLISHED=$(curl -sS --max-time 10 "https://open-store.io/api/v4/apps/${APP}" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['data'].get('version',''))" 2>/dev/null || echo "")
if [ -z "$LAST_PUBLISHED" ]; then
  LAST_PUBLISHED=$(ls -1d livraison/utoutlook-* 2>/dev/null | sed 's|.*utoutlook-||' | sort -V | tail -1)
  [ -z "$LAST_PUBLISHED" ] && LAST_PUBLISHED="4.0.93"
  echo "(API injoignable, fallback sur $LAST_PUBLISHED)"
fi
echo "Dernière version publiée sur OpenStore: $LAST_PUBLISHED"

# Commits depuis le commit de la dernière version publiée (cherché dans les messages de commit)
LAST_COMMIT=$(git log --oneline --grep="Version $LAST_PUBLISHED" -1 --format="%H" 2>/dev/null || git log --oneline --grep="v$LAST_PUBLISHED" -1 --format="%H" 2>/dev/null || echo "")
if [ -z "$LAST_COMMIT" ]; then
  echo "(commit de $LAST_PUBLISHED non trouvé, whatsnew depuis 20 derniers commits)"
  RANGE="HEAD~20..HEAD"
else
  RANGE="${LAST_COMMIT}..HEAD"
fi

# Ligne one-shot (session de débogage) — à VIDER pour les versions suivantes :
# v4.1.0: version COURTE et simplifiée demandée par Mathias. ASCII uniquement
# (garde-fou store : aucun caractère accenté dans whatsnew.txt).
DEBUG_SESSION_NOTE="HARD DEBUG SESSION :) - A long debugging session on the phone went into this release: more reliable startup, a visible progress screen, the right app icon, and cleaner quitting and relaunching. Thanks for testing every build!"

# Commits (français) -> traduction auto en anglais : le whatsnew du store DOIT être en anglais
RAW_COMMITS=$(git log "$RANGE" --format="- %s" 2>/dev/null | sed 's/ — Tests [0-9/]*\. Version [0-9.]*\.//; s/Tests [0-9/]*\. Version [0-9.]*\.//' | head -60)
if [ -n "$RAW_COMMITS" ]; then
  TRANSLATED=$(printf '%s\n' "$RAW_COMMITS" | translate_en) || { echo "ERREUR: traduction auto FR->EN indisponible — whatsnew.txt NON généré, upload bloqué (contenu store doit être en anglais)"; exit 1; }
else
  TRANSLATED=""
fi

# v4.3.6: ne PAS écraser un whatsnew.txt rédigé à la main (le script l'écrasait
# systématiquement, rendant impossible un texte soigné validé par Mathias).
if [ -f "$KIT/whatsnew.txt" ]; then
  echo "whatsnew.txt existant conservé (rédigé manuellement) — non écrasé."
else
{
  echo "Version $VERSION — $(LC_ALL=C date +"%d %B %Y")"
  echo ""
  if [ -n "$DEBUG_SESSION_NOTE" ]; then
    echo "$DEBUG_SESSION_NOTE" | fold -s -w 80
    echo ""
  fi
  echo "Tested on Fairphone 5 (FP5) with Ubuntu Touch framework 24.04 — no guarantee on other models."
  echo "Thanks for your feedback! :)"
  echo ""
  echo "Changes since $LAST_PUBLISHED:"
  echo ""
  printf '%s\n' "$TRANSLATED"
  echo ""
  echo "Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias."
} > "$KIT/whatsnew.txt"
echo "whatsnew.txt généré (traduit en anglais) depuis $LAST_PUBLISHED ($RANGE)"
fi

[ -f "$KIT/metadata.json" ] || echo '{"name":"UToutlook Mail","description":"Outlook mail client for Ubuntu Touch"}' > "$KIT/metadata.json"

# v4.4.1: longue description du store, versionnée avec la release.
# Un fichier absent n'est PAS une erreur (les anciennes releases n'en ont pas),
# mais le recap le signale clairement a Mathias.
DESC="$KIT/description.txt"
if [ -f "$DESC" ]; then
  echo "description.txt present — sera publie avec $VERSION"
else
  echo "ATTENTION: $KIT/description.txt absent — la description du store ne sera pas mise a jour"
fi

# Garde-fou filet de sécurité : tout ce qui part au store doit être 100 % anglais (aucun accent)
for f in "$KIT/whatsnew.txt" "$KIT/metadata.json" "$DESC"; do
  if [ -f "$f" ] && grep -qP '[\x{00C0}-\x{00FF}]' "$f"; then
    echo "ERREUR: $f contient des caractères accentués — le contenu envoyé au store doit être EN ANGLAIS. Upload bloqué."
    exit 1
  fi
done

echo ""
echo "=== RÉCAP À MONTRER À MATHIAS (obligatoire avant upload) ==="
echo "Livraison : $LIVRAISON/"
ls -la "$LIVRAISON"
echo "Kit : $KIT/"
ls -la "$KIT"
echo "whatsnew.txt :"
cat "$KIT/whatsnew.txt" 2>/dev/null
echo ""
if [ -f "$DESC" ]; then
  echo "description.txt (3 premieres lignes) :"
  head -3 "$DESC"
  echo ""
fi
echo "SHA512 du click :"
sha512sum "$CLICK"

# --- UPLOAD (confirmation interactive + OK explicite + apikey) ---
if [ "$UPLOAD_REQUESTED" = 1 ]; then
  if [ "$UPLOAD_OK" != "OK" ]; then
    echo "ERREUR: upload refusé — il faut passer \"OK\" en argument (OK explicite de Mathias sur le contenu montré ci-dessus)"
    exit 1
  fi
  echo ""
  echo "=== CONFIRMATION FINALE ==="
  echo "Vous êtes sur le point d'envoyer $VERSION sur l'OpenStore."
  echo "Récap affiché ci-dessus (whatsnew + SHA512) — relisez-le avant de continuer."
  CONFIRM=""
  read -r -p "Tapez OK en majuscules pour confirmer l'upload (autre chose = annulation) : " CONFIRM || true
  if [ "$CONFIRM" != "OK" ]; then
    echo "Upload ANNULÉ (confirmation non donnée). Rien n'a été envoyé."
    exit 1
  fi
  echo "Confirmation reçue. Vérification de l'apikey..."
  if [ -z "$OPENSTORE_APIKEY" ]; then
    echo "ERREUR: OPENSTORE_APIKEY non défini (env var, jamais écrite dans un fichier)"
    exit 1
  fi
  echo "=== Upload OpenStore $VERSION ==="
  # v4.1.0: clé API jamais dans la ligne de commande (ps/logs) — curl --config sur stdin
  printf 'url = "https://open-store.io/api/v3/manage/%s/revision?apikey=%s"\n' "$APP" "$OPENSTORE_APIKEY" | \
  curl -sS -X POST --config - \
    -H "Expect:" \
    -F "file=@${LIVRAISON}/${APP}_${VERSION}_arm64.click" \
    -F "changelog=<${KIT}/whatsnew.txt"
  echo ""

  # v4.4.1: la longue description est publiee AVEC la release, dans le meme
  # flux. PUT /api/v3/manage/<app> — champ 'description' (source: openstore-api
  # src/api/manage.ts, router.put('/:id')). Jamais de clé dans la ligne de cmd.
  if [ -f "$DESC" ]; then
    echo "=== Publication de la description $VERSION ==="
    DESC_RESP="/tmp/opencode/openstore-description-response.txt"
    DESC_STATUS=$(printf 'url = "https://open-store.io/api/v3/manage/%s?apikey=%s"\n' "$APP" "$OPENSTORE_APIKEY" | \
      curl -sS -X PUT --config - \
        -H "Expect:" \
        -F "description=<${DESC}" \
        -w '%{http_code}' -o "$DESC_RESP")
    if [ "$DESC_STATUS" != "200" ]; then
      echo "ERREUR: description non publiee (HTTP $DESC_STATUS) — réponse:"
      cat "$DESC_RESP" 2>/dev/null || true
      echo "La revision $VERSION est bien uploadee, mais la description est restee a l'ancienne version."
      exit 1
    fi
    echo "Description $VERSION publiee."
  fi

  echo "=== Vérification store ==="
  curl -sS "https://open-store.io/api/v4/apps/${APP}" | python3 -c "import json,sys; d=json.load(sys.stdin); print('version:', d['data'].get('version'))"
else
  echo ""
  echo "Pour uploader après relecture du récap :"
  echo "  OPENSTORE_APIKEY=... ./openstore-prepare.sh --upload OK"
  echo "  (version $VERSION par défaut — ou précisez-la avant --upload)"
  echo "  Le fichier whatsnew.txt ET la description.txt du kit sont publies ensemble."
fi
