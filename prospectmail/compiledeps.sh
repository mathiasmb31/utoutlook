#!/bin/bash
set -e # Exit immediately on error
# ===================================
# STEP 1: BUILD notify client
# ===================================
echo "[1/4] Building notify ..."
cp -r ${ROOT}/notifysrc ${BUILD_DIR}/
cd ${BUILD_DIR}/notifysrc/
mkdir -p build
cd build
cmake ../CMakeLists.txt
make
# ===================================
# STEP 2: BUILD THE FAKE xdg-open
# ===================================
echo "[2/4] Building fake xdg-open ..."
cp -r ${ROOT}/utils/xdg-open/ ${BUILD_DIR}/
cd ${BUILD_DIR}/xdg-open/
mkdir -p build
cd build
cmake ..
make

# ===================================
# STEP 3: Install DEPENDENCIES
# ===================================
echo "[3/4] Install dependencies..."

cd ${BUILD_DIR}
DEPENDENCIES="libhybris-utils notify-osd xdotool libmaliit-glib2 libxdo3 x11-utils"

for dep in $DEPENDENCIES; do
          apt download $dep:arm64
          mv ${dep}_*.deb ${dep}.deb
          rm -rvf "${dep}.deb_extract_chsdjksd" || true
          mkdir "${dep}.deb_extract_chsdjksd"
          dpkg-deb -x "${dep}.deb" "${dep}.deb_extract_chsdjksd"
done

# =================================================
# STEP 4: Downloading maliit-inputcontext-gtk3
# =================================================

echo "[4/4] Building maliit-inputcontext-gtk3 and download dependencies..."

PKGNAME="maliit-inputcontext-gtk"
VERSION="0.99.1+git20151116.72d7576"
#ORIG_URL="https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/maliit-inputcontext-gtk/0.99.1+git20151116.72d7576-3build3/maliit-inputcontext-gtk_0.99.1+git20151116.72d7576.orig.tar.xz"
ORIG_URL="https://mirrors01.ircam.fr/pub/ubuntu/archive/pool/universe/m/maliit-inputcontext-gtk/maliit-inputcontext-gtk_0.99.1+git20151116.72d7576.orig.tar.xz"
#DEBIAN_URL="https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/maliit-inputcontext-gtk/0.99.1+git20151116.72d7576-3build3/maliit-inputcontext-gtk_0.99.1+git20151116.72d7576-3build3.debian.tar.xz"
DEBIAN_URL="https://mirrors01.ircam.fr/pub/ubuntu/archive/pool/universe/m/maliit-inputcontext-gtk/maliit-inputcontext-gtk_0.99.1+git20151116.72d7576-4.debian.tar.xz"
WORKDIR_MALIIT="${PKGNAME}-${VERSION}"
rm -rvf $WORKDIR_MALIIT/ || true
mkdir -p "$WORKDIR_MALIIT"
cd "$WORKDIR_MALIIT"

echo "📦 Download sources..."
wget -q "$ORIG_URL" -O "${PKGNAME}_${VERSION}.orig.tar.xz"
wget -q "$DEBIAN_URL" -O "${PKGNAME}_${VERSION}.debian.tar.xz"

echo "📂 Extract original code..."
tar -xf "${PKGNAME}_${VERSION}.orig.tar.xz"
SRC_DIR_MALIIT=$(tar -tf "${PKGNAME}_${VERSION}.orig.tar.xz" | head -1 | cut -d/ -f1)

echo "📂 Extract debian files..."
tar -xf "${PKGNAME}_${VERSION}.debian.tar.xz" -C "$SRC_DIR_MALIIT"

echo "Apply patch..."
cd ${BUILD_DIR}/$SRC_DIR_MALIIT/maliit-inputcontext-gtk-$VERSION/
patch ${BUILD_DIR}/$SRC_DIR_MALIIT/maliit-inputcontext-gtk-$VERSION/gtk-input-context/client-gtk/client-imcontext-gtk.c ${ROOT}/patches/maliit-inputcontext-gtk/client-imcontext-gtk.c.patch
echo "${ROOT}/patches/maliit-inputcontext-gtk/client-imcontext-gtk.c.patch"

echo "Compile..."
EDITOR=true dpkg-source --commit . fix-keyboard
DEB_BUILD_OPTIONS=nocheck dpkg-buildpackage -us -uc -a arm64

echo "[7/9] Copying files..."

echo "Copying dependencies..."
cd ${BUILD_DIR}
# Copie des fichiers du dossier /lib/ de chaque paquet
rm -rvf $INSTALL_DIR/lib
mkdir -p "$INSTALL_DIR/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/"
for DIR in *_extract_chsdjksd; do
          if [ -d "$DIR/usr/lib/aarch64-linux-gnu/" ]; then
                    cp -r "$DIR/usr/lib/aarch64-linux-gnu/"* "$INSTALL_DIR/lib/aarch64-linux-gnu/"
          fi
done

echo "done"
# Copy binaries in bin/
mkdir -p "$INSTALL_DIR/bin"
cp *_extract_chsdjksd/usr/bin/xdotool "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/getprop "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/xprop "$INSTALL_DIR/bin/"
cp *_extract_chsdjksd/usr/bin/xev "$INSTALL_DIR/bin/"

echo "Copying maliit-input-context..."
cp ${ROOT}/patches/maliit-inputcontext-gtk/immodules.cache $INSTALL_DIR/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/
cp ${BUILD_DIR}/$WORKDIR_MALIIT/maliit-inputcontext-gtk-$VERSION/builddir/gtk3/gtk-3.0/im-maliit.so $INSTALL_DIR/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/

mkdir -p "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/sleep.sh "$INSTALL_DIR/utils/"
cp ${ROOT}/utils/get-scale.sh "$INSTALL_DIR/utils/"
cp ${BUILD_DIR}/xdg-open/build/xdg-open-test $INSTALL_DIR/bin/
cp ${BUILD_DIR}/notifysrc/build/notify $INSTALL_DIR/bin/
chmod +x $INSTALL_DIR/utils/sleep.sh
