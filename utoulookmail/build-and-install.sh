#!/bin/bash
# build-and-install.sh — Build clickable + re-packaging xz + install sur le téléphone
# Usage: ./build-and-install.sh [--no-install]
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "==> [1/3] Clickable build..."
clickable build

CLICK_FILE=$(ls -t build/aarch64-linux-gnu/app/*.click 2>/dev/null | head -1)
if [ -z "$CLICK_FILE" ]; then
    echo "ERREUR: aucun click trouvé dans build/aarch64-linux-gnu/app/" >&2
    exit 1
fi

echo ""
echo "==> [2/3] Re-packaging xz..."
"$PROJECT_DIR/repack-click-xz.sh" "$CLICK_FILE"

if [ "$1" = "--no-install" ]; then
    echo ""
    echo "==> Build terminé (--no-install). Click: $CLICK_FILE"
    exit 0
fi

echo ""
echo "==> [3/3] Installation sur le téléphone..."
clickable install

echo ""
echo "==> Terminé. Click: $(ls -lh "$CLICK_FILE" | awk '{print $5, $9}')"
