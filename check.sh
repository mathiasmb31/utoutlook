#!/bin/bash
# check.sh — toutes les vérifications pre-commit en UNE commande
# (évite un appel IA : syntaxe + version + lint + tests + confidentialité + i18n)
# Code Electron et tests vivent dans utoulookmail/utoutlookmail/ — pas à la racine.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
APP="utoulookmail/utoutlookmail"
APP_ID="utoutlook.mathias"
FAILED=0

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "Usage: ./check.sh"
  echo "  1/7 bash -n des scripts (racine, utoulookmail/, githooks/)"
  echo "  2/7 node --check des .mjs/.js de $APP (src, public, scripts, test)"
  echo "  3/7 version identique dans manifest.json et package.json"
  echo "  4/7 npm run lint (ESLint 9 + .eslintrc.json legacy ; 0 erreur attendu)"
  echo "  5/7 npm test (node --test)"
  echo "  6/7 confidentialite : aucun 'XXXX' publie"
  echo "  7/7 i18n : chaînes accentuees hors catalogue (informatif)"
  exit 0
fi

fail() { echo "  ERREUR: $*"; FAILED=1; }

echo "== 1/7 bash -n des scripts"
shopt -s nullglob
tmp=$(mktemp)
for s in ./*.sh ./utoulookmail/*.sh ./githooks/*; do
  [ -f "$s" ] || continue
  if bash -n "$s" 2>"$tmp"; then
    echo "  OK $s"
  else
    fail "syntaxe $s"; sed 's/^/     /' "$tmp"
  fi
done
rm -f "$tmp"

echo "== 2/7 node --check ($APP)"
n=0
bad=0
while IFS= read -r f; do
  n=$((n + 1))
  err=$(node --check "$f" 2>&1) || { fail "syntaxe JS $f"; echo "$err" | head -3 | sed 's/^/     /'; bad=1; }
done < <(find "$APP/src" "$APP/public" "$APP/scripts" "$APP/test" -type f \
           \( -name '*.mjs' -o -name '*.js' \) 2>/dev/null | sort)
if [ ! -d "$APP" ]; then fail "$APP introuvable (mauvaise racine ?)"; fi
[ "$bad" -eq 0 ] && echo "  OK $n fichier(s)"

echo "== 3/7 version synchronisee (manifest.json == package.json)"
MANIFEST_VER=$(grep -m1 '"version"' utoulookmail/manifest.json 2>/dev/null | sed 's/.*"version"[[:space:]]*:[[:space:]]*"//;s/".*//')
PKG_VER=$(grep -m1 '"version"' "$APP/package.json" 2>/dev/null | sed 's/.*"version"[[:space:]]*:[[:space:]]*"//;s/".*//')
if [ -n "$MANIFEST_VER" ] && [ "$MANIFEST_VER" = "$PKG_VER" ]; then
  echo "  OK $MANIFEST_VER"
else
  fail "versions differentes : manifest.json=$MANIFEST_VER package.json=$PKG_VER (-> ./bump-version.sh X.Y.Z)"
fi

echo "== 4/7 lint"
tmp=$(mktemp)
if (cd "$APP" && ESLINT_USE_FLAT_CONFIG=false npm run lint >"$tmp" 2>&1); then
  echo "  OK $(grep -E 'problems?' "$tmp" | tail -1 | sed 's/^ *//')"
else
  fail "lint (erreurs ESLint)"; tail -15 "$tmp" | sed 's/^/     /'
fi
rm -f "$tmp"

echo "== 5/7 tests"
tmp=$(mktemp)
if (cd "$APP" && npm test >"$tmp" 2>&1); then
  echo "  OK $(grep -E '^ℹ (tests|pass|fail) ' "$tmp" | tr '\n' ' ' | sed 's/ *$//')"
else
  fail "tests"; grep -E '^✖|^ℹ (tests|pass|fail) ' "$tmp" | head -12 | sed 's/^/     /'
fi
rm -f "$tmp"

echo "== 6/7 confidentialite (XXXX)"
# Les fichiers qui documentent la règle elle-meme sont exclus du grep.
if grep -ri XXXX --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=build \
     --exclude-dir=build-ninja --exclude-dir=dist --exclude-dir=.ccache --exclude-dir=amd64-root \
     --exclude=AGENTS.md --exclude=check.sh --exclude=git-auto.sh --exclude=menu.sh . 2>/dev/null | grep -q .; then
  fail "'XXXX' detecte — commit interdit"
  grep -ril XXXX --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=build \
     --exclude-dir=build-ninja --exclude-dir=dist --exclude-dir=.ccache --exclude-dir=amd64-root \
     --exclude=AGENTS.md --exclude=check.sh --exclude=git-auto.sh --exclude=menu.sh . 2>/dev/null | head -5 | sed 's/^/     /'
else
  echo "  OK aucun"
fi

echo "== 7/7 i18n (chaines accentuees hors catalogue — informatif)"
node - "$APP/src" "$APP/public" "utoulookmail/qml" <<'EOF'
// Extrait les chaînes littérales (hors commentaires) des fichiers d'UI et
// signale celles qui contiennent des accents : elles devraient passer par le
// catalogue i18n (src/i18n.mjs pour l'UI, utils/common.sh → utoutlook_t pour le shell).
import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

const ACCENT = /[\u00C0-\u00FF]/;
const LOG_LINE = /(^|[^\w.])logger\.|(^|[^\w.])console\./;
const hits = [];

function walk(p, out) {
    const st = statSync(p);
    if (st.isDirectory()) {
        for (const e of readdirSync(p)) walk(path.join(p, e), out);
    } else if (/\.(mjs|js|html|qml)$/.test(p) && !/i18n/i.test(path.basename(p))) {
        out.push(p);
    }
    return out;
}

// Retourne les chaînes littérales d'une ligne, en ignorant le code hors quotes.
function stringsOf(line) {
    const out = [];
    let i = 0, quote = null, cur = '', inBlock = false;
    while (i < line.length) {
        const c = line[i], n = line[i + 1];
        if (inBlock) {
            if (c === '*' && n === '/') { inBlock = false; i += 2; continue; }
            i++; continue;
        }
        if (quote) {
            if (c === '\\') { cur += n ?? ''; i += 2; continue; }
            if (c === quote) { out.push(cur); cur = ''; quote = null; i++; continue; }
            cur += c; i++; continue;
        }
        if (c === '/' && n === '/') break;
        if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
        if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
        i++;
    }
    return out;
}

for (const root of process.argv.slice(2)) {
    let files = [];
    try { files = walk(root, []); } catch { continue; }
    for (const file of files) {
        let inBlock = false;
        readFileSync(file, 'utf-8').split('\n').forEach((line, idx) => {
            const trimmed = line.trim();
            if (inBlock) { if (trimmed.includes('*/')) inBlock = false; return; }
            if (trimmed.startsWith('/*') && !trimmed.includes('*/')) { inBlock = true; return; }
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
            if (LOG_LINE.test(line)) return;
            if (stringsOf(line).some((s) => ACCENT.test(s))) {
                hits.push(`${file}:${idx + 1}: ${trimmed.slice(0, 110)}`);
            }
        });
    }
}

console.log(hits.slice(0, 12).join('\n'));
if (hits.length > 12) console.log(`... +${hits.length - 12} autre(s)`);
EOF
echo "  (verifier : selecteurs DOM/logs techniques = faux positifs ; texte visible = catalogue i18n)"

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "== check termine : OK"
else
  echo "== check termine : ECHEC (voir ERREUR ci-dessus)"
fi
exit "$FAILED"
