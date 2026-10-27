#!/bin/bash
# Build complet utoutlook: C++ (notify, Ninja+ccache+mold) + Electron (prospect-mail)
# Usage: ./build-fast.sh [jobs] [--cpp-only|--electron-only]
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build-ninja"
ELECTRON_DIR="$PROJECT_DIR/utoutlookmail"
JOBS="${1:-$(nproc)}"
MODE="${2:-all}"

# Répertoire temporaire sur /mnt/five (évite le manque d'espace sur /tmp)
export TMPDIR="${TMPDIR:-/mnt/five/tmp-electron}"
mkdir -p "$TMPDIR"

# Cache Electron persistant (évite de retélécharger les binaires ~100MB à chaque build)
export ELECTRON_CACHE="${ELECTRON_CACHE:-$HOME/.cache/electron}"
mkdir -p "$ELECTRON_CACHE"

# Nettoyer un ancien cache in-source qui bloque le out-of-source
rm -rf "$PROJECT_DIR/CMakeCache.txt" "$PROJECT_DIR/CMakeFiles" \
       "$PROJECT_DIR/cmake_install.cmake" "$PROJECT_DIR/notify_autogen" 2>/dev/null

build_cpp() {
    if [ ! -f "$BUILD_DIR/build.ninja" ]; then
        echo "==> [C++] Configuration CMake (Ninja + ccache + mold)..."
        mkdir -p "$BUILD_DIR"
        cd "$BUILD_DIR"
        cmake -G Ninja \
            -DCMAKE_BUILD_TYPE=Release \
            -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
            -DCMAKE_C_COMPILER_LAUNCHER=ccache \
            -DCMAKE_LINKER_TYPE=MOLD \
            -DCMAKE_CXX_FLAGS="-pipe" \
            ..
    fi
    echo "==> [C++] Build notify avec $JOBS jobs..."
    cd "$BUILD_DIR"
    ninja -j"$JOBS"
    echo "==> [C++] Terminé: $BUILD_DIR/notify"
}

build_electron() {
    echo "==> [Electron] Build prospect-mail..."
    cd "$ELECTRON_DIR"
    
    # Installer les dépendances si nécessaire
    if [ ! -d node_modules ] || [ ! -f node_modules/.package-lock.json ]; then
        npm ci
    else
        npm install
    fi
    
    # Build séquentiel: arm64 d'abord (natif Ubuntu Touch), puis x64 (desktop)
    echo "==> [Electron] Build arm64 (natif)..."
    npx electron-builder --arm64 -l tar.gz --publish never
    
    echo "==> [Electron] Build x64 (desktop)..."
    npx electron-builder --x64 -l tar.gz --publish never
    
    echo "==> [Electron] Terminé:"
    ls -lh dist/*.tar.gz
}

case "$MODE" in
    --cpp-only)
        build_cpp
        ;;
    --electron-only)
        build_electron
        ;;
    *)
        echo "==> Build parallèle: C++ (-j$JOBS) + Electron (arm64 → x64)"
        echo ""
        
        build_cpp &
        PID_CPP=$!
        
        build_electron &
        PID_ELECTRON=$!
        
        ERRORS=0
        wait $PID_CPP || { echo "ERREUR: build C++"; ERRORS=$((ERRORS+1)); }
        wait $PID_ELECTRON || { echo "ERREUR: build Electron"; ERRORS=$((ERRORS+1)); }
        
        if [ $ERRORS -eq 0 ]; then
            echo ""
            echo "==> Build complet terminé:"
            echo "    C++:      $BUILD_DIR/notify"
            echo "    Electron: $ELECTRON_DIR/dist/prospect-mail-*.tar.gz"
        else
            exit 1
        fi
        ;;
esac
