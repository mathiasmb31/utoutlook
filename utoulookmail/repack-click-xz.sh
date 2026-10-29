#!/bin/bash
# repack-click-xz.sh — Re-compresse le data.tar d'un .click en xz
# Gain typique : 20-30% sur la taille du click (xz vs gzip)
# Usage: repack-click-xz.sh <fichier.click>

set -e

CLICK="$1"
if [ -z "$CLICK" ] || [ ! -f "$CLICK" ]; then
    echo "Usage: $0 <fichier.click>" >&2
    exit 1
fi

# Résoudre en chemin absolu
CLICK=$(readlink -f "$CLICK")
CLICK_DIR=$(dirname "$CLICK")
CLICK_NAME=$(basename "$CLICK")

SIZE_BEFORE=$(stat -c%s "$CLICK")
echo "Taille avant : $(numfmt --to=iec $SIZE_BEFORE)"

WORKDIR=$(mktemp -d)
trap "rm -rf $WORKDIR" EXIT

# Extraire le .click (ar archive)
cd "$WORKDIR"
ar x "$CLICK"

# Vérifier que data.tar.gz existe
if [ ! -f data.tar.gz ]; then
    echo "ERREUR: data.tar.gz non trouvé dans $CLICK" >&2
    exit 1
fi

# Extraire, re-compresser en xz
mkdir data-extract
tar xzf data.tar.gz -C data-extract
rm data.tar.gz
tar cJf data.tar.xz -C data-extract .
rm -rf data-extract

# Recréer le .click avec data.tar.xz
# Ordre important pour un .deb valide : debian-binary, control.tar.*, data.tar.*
NEW_CLICK="${CLICK_DIR}/${CLICK_NAME%.click}-xz.click"
ar rcs "$NEW_CLICK" debian-binary control.tar.gz data.tar.xz

SIZE_AFTER=$(stat -c%s "$NEW_CLICK")
echo "Taille après : $(numfmt --to=iec $SIZE_AFTER)"
GAIN=$((SIZE_BEFORE - SIZE_AFTER))
PCT=$((GAIN * 100 / SIZE_BEFORE))
echo "Gain : $(numfmt --to=iec $GAIN) (-${PCT}%)"

# Remplacer l'original
mv "$NEW_CLICK" "$CLICK"
echo "Click re-packagé en xz : $CLICK"
