#!/bin/bash
# bump-version.sh <X.Y.Z> — synchronise la version dans manifest.json + package.json
# (règle Mathias : version synchronisée dans les deux AVANT le build)
set -e
if [ "$1" = "--help" ] || [ "$1" = "-h" ] || [ -z "$1" ]; then
  echo "Usage: ./bump-version.sh <X.Y.Z>"
  echo "  -> met à jour le champ \"version\" de tous les manifest.json / package.json du projet"
  exit 0
fi
VER="$1"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
N=0
for f in $(find . -maxdepth 4 \( -name manifest.json -o -name package.json \) \
             -not -path '*/node_modules/*' -not -path '*/build/*' -not -path '*/dist/*' 2>/dev/null); do
  if grep -q '"version"' "$f"; then
    sed -i -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+\"/\1$VER\"/" "$f"
    echo "bump: $f -> $VER"
    N=$((N+1))
  fi
done
# v4.2.1: synchroniser AUSSI la version RACINE de package-lock.json (les 2
# premiers champs "version", avant le bloc "dependencies"). Le sed générique
# ci-dessus ne touche pas le lock (find limite à manifest/package.json) et il
# ne doit PAS toucher les versions des dépendances.
for f in $(find . -maxdepth 4 -name package-lock.json \
             -not -path '*/node_modules/*' -not -path '*/build/*' -not -path '*/dist/*' 2>/dev/null); do
  sed -i -E "1,12s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+\"/\1$VER\"/" "$f"
  echo "bump: $f (version racine) -> $VER"
done
# v4.2.2: NE PLUS versionner le StartupWMClass du .desktop. Lomiri attend
# l'ID NON VERSIONNÉ (`appid://utoutlook.mathias_utoutlook` dans le Launcher
# model) ; la synchronisation v4.1.9→v4.2.1 créait une icône jaune et bloquait
# le splash. On force la valeur non versionnée (au cas où un ancien bump
# l'aurait laissée versionnée) et on ne la touche plus aux prochains bumps.
DESKTOP="$ROOT/utoulookmail/utoutlook.desktop"
if [ -f "$DESKTOP" ]; then
  sed -i -E "s/^StartupWMClass=utoutlook\.mathias_utoutlook(_[0-9]+\.[0-9]+\.[0-9]+)?$/StartupWMClass=utoutlook.mathias_utoutlook/" "$DESKTOP"
  echo "bump: $DESKTOP StartupWMClass -> utoutlook.mathias_utoutlook (non versionné)"
fi

[ "$N" -gt 0 ] && echo "OK: $N fichier(s) -> version $VER" || { echo "AUCUN fichier de version trouvé"; exit 1; }
