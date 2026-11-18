#!/bin/bash
# compiledeps-amd64.sh — dépendances pour le build click amd64 (x86_64)
# Host aarch64 : on télécharge les .deb amd64 précompilés depuis archive.ubuntu.com
# (pas de cross-compilation du binaire notify custom possible ici : pas de
# cross-compiler x86_64 installé ; utoutlook_notify() dégrade gracieusement
# sans le binaire).
set -e

export MAKEFLAGS="${MAKEFLAGS:--j2}"

ARCH_DIR="x86_64-linux-gnu"
ARCH="amd64"
UBUNTU="http://archive.ubuntu.com/ubuntu"

echo "[1/3] Téléchargement des .deb amd64 précompilés..."
cd "${BUILD_DIR}"

# Index noble main+universe amd64 (mis en cache si absent)
if [ ! -f /tmp/Packages-main-amd64.gz ]; then
	wget -q -O /tmp/Packages-main-amd64.gz "$UBUNTU/dists/noble/main/binary-amd64/Packages.gz"
fi
if [ ! -f /tmp/Packages-universe-amd64.gz ]; then
	wget -q -O /tmp/Packages-universe-amd64.gz "$UBUNTU/dists/noble/universe/binary-amd64/Packages.gz"
fi

download_deb() {
	local pkg="$1"
	local file
	file=$(gunzip -c /tmp/Packages-main-amd64.gz /tmp/Packages-universe-amd64.gz 2>/dev/null | awk -v p="$pkg" '
		/^Package: / { name=$2 }
		/^Filename: / { if (name==p) { print $2; exit } }
	')
	if [ -z "$file" ]; then
		echo "  !! $pkg non trouvé en amd64, ignoré"
		return 0
	fi
	echo "  $pkg -> $file"
	wget -q "$UBUNTU/$file" -O "${pkg}_amd64.deb"
	rm -rf "${pkg}_extract"
	mkdir "${pkg}_extract"
	dpkg-deb -x "${pkg}_amd64.deb" "${pkg}_extract"
}

# Dépendances libs (équivalent arm64: libhybris-utils notify-osd xdotool
# libmaliit-glib2 libxdo3 x11-utils). libhybris-utils n'existe pas en amd64
# (spécifique Ubuntu Touch arm64) — ignoré pour le build desktop.
for dep in notify-osd xdotool libmaliit-glib2 libxdo3 x11-utils; do
	download_deb "$dep"
done

echo "[2/3] Copie des libs dans \$INSTALL_DIR/lib/$ARCH_DIR..."
rm -rf "$INSTALL_DIR/lib"
mkdir -p "$INSTALL_DIR/lib/$ARCH_DIR"
for DIR in *_extract; do
	if [ -d "$DIR/usr/lib/$ARCH_DIR/" ]; then
		cp -r "$DIR/usr/lib/$ARCH_DIR/"* "$INSTALL_DIR/lib/$ARCH_DIR/" 2>/dev/null || true
	fi
	if [ -d "$DIR/lib/$ARCH_DIR/" ]; then
		cp -r "$DIR/lib/$ARCH_DIR/"* "$INSTALL_DIR/lib/$ARCH_DIR/" 2>/dev/null || true
	fi
done

echo "[3/3] Binaires utilitaires..."
mkdir -p "$INSTALL_DIR/bin"
for DIR in *_extract; do
	if [ -f "$DIR/usr/bin/getprop" ]; then
		cp "$DIR/usr/bin/getprop" "$INSTALL_DIR/bin/" 2>/dev/null || true
	fi
done

mkdir -p "$INSTALL_DIR/utils/"
cp "${ROOT}/utils/sleep.sh" "$INSTALL_DIR/utils/" 2>/dev/null || true
cp "${ROOT}/utils/get-scale.sh" "$INSTALL_DIR/utils/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/utils/sleep.sh" 2>/dev/null || true

echo "compiledeps-amd64 terminé."
