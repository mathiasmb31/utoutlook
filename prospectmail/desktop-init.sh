#!/bin/bash -e


#################
# Launcher init #
#################



# shellcheck source=/dev/null

SNAP_DESKTOP_COMPONENTS_NEED_UPDATE="false"

# Set $REALHOME to the users real home directory
REALHOME=/home/phablet/.config/prospectmail.mathias/

# If the user has modified their user-dirs settings, force an update


if [ "$SNAP_ARCH" == "amd64" ]; then
  ARCH="x86_64-linux-gnu"
elif [ "$SNAP_ARCH" == "armhf" ]; then
  ARCH="arm-linux-gnueabihf"
elif [ "$SNAP_ARCH" == "arm64" ]; then
  ARCH="aarch64-linux-gnu"
elif [ "$SNAP_ARCH" == "ppc64el" ]; then
  ARCH="powerpc64le-linux-gnu"
else
  ARCH="aarch64-linux-gnu"
fi

SNAP_DESKTOP_ARCH_TRIPLET="$ARCH"

if [ -f "$SNAP/lib/bindtextdomain.so" ]; then
  export LD_PRELOAD="$LD_PRELOAD:$SNAP/lib/bindtextdomain.so"
fi

export REALHOME
export SNAP_DESKTOP_COMPONENTS_NEED_UPDATE
export SNAP_DESKTOP_ARCH_TRIPLET

exec "$@"
