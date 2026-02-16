#!/bin/bash -e
#modified
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
echo $SNAP
echo "Going to launch"
echo "GRID UNIT PX"$GRID_UNIT_PX
#export QT_QUICK_CONTROLS_STYLE=Suru
#export QT_EXCLUDE_GENERIC_BEARER=1
#export GDK_DEBUG=gl-gles
#export SNAP_REEXEC=0
#export QT_QPA_PLATFORM="ubuntumirclient;wayland-egl;xcb"
#export LESSCLOSE=/usr/bin/lesspipe %s %s
#export XDG_SESSION_CLASS=user
#export GDK_GL=gles
#export TERM=xterm-256color
#export LESSOPEN=| /usr/bin/lesspipe %s
#export USER=phablet
#export SDL_VIDEODRIVER=wayland
export DISPLAY=:0.0
#export SHLVL=1
#export XDG_SESSION_ID=c119
#export QT_FILE_SELECTORS=ubuntu-touch
#export XDG_RUNTIME_DIR=/run/user/32011
#export XDG_DATA_DIRS=/usr/local/share:/usr/share:/var/lib/snapd/desktop
#PATH=${PATH}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin
#export QTWEBENGINE_CHROMIUM_FLAGS=--enable-gpu-rasterization --enable-accelerated-video-decode --enable-features=MojoVideoDecoder
#export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/32011/bus
scale=$(./utils/get-scale.sh 2>/dev/null )
dpioptions="--high-dpi-support=1 --force-device-scale-factor=1 "
sandboxoptions="--no-sandbox"
#gpuoptions="--use-gl=egl --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=UseSkiaRenderer,VaapiVideoDecoder --disable-frame-rate-limit --disable-gpu-vsync --enable-oop-rasterization"
gpuoptions="--use-gl=egl"
echo "------------------------------------------------------------------"
#exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/app/prospect-mail $dpioptions $sandboxoptions $gpuoptions "
exec $SNAP/app/prospect-mail $dpioptions $sandboxoptions $gpuoptions
