#!/bin/bash
set -ax
export WD=`pwd`
echo $WD
sleep 5
export GDK_SCALE=2  
export GTK_IM_MODULE=Maliit 
export GTK_IM_MODULE_FILE=/home/phablet/.config/prospectmail.mathias/immodules.cache 
export GDK_BACKEND=x11 
export DISABLE_WAYLAND=1 
export DCONF_PROFILE=/nonexistent
export XDG_CONFIG_HOME=/home/phablet/.config/prospectmail.mathias/
export XDG_DATA_HOME=/home/phablet/.config/prospectmail.mathias/
export XDG_DESKTOP_DIR=/home/phablet/.config/prospectmail.mathias/
export LD_LIBRARY_PATH=$PWD/lib/aarch64-linux-gnu/
trap 'printf "%3d: " "$LINENO"' DEBUG
utils/mkdir.c
echo "\"$PWD/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/im-maliit.so\""  > /home/phablet/.config/prospectmail.mathias/immodules.cache 
echo  "\"Maliit\" \"Maliit Input Method\" \"maliit\" \"\" \"en:ja:ko:zh:*\""  >> /home/phablet/.config/prospectmail.mathias/immodules.cache 
echo 'XDG_DESKTOP_DIR="/home/phablet/.cache/prospectmail.mathias/downloads/"'> /home/phablet/.config/prospectmail.mathias/user-dirs.dirs

echo "Going to launch"
echo "GRID UNIT PX"$GRID_UNIT_PX
export QT_FILE_SELECTORS=ubuntu-touch

echo "------------------------------------------------------------------"
echo $$ >>/home/phablet/.config/prospectmail.mathias/data/__prospect.pid
utils/auto_zoom.sh &
export PATH=$WD/bin:$PATH
echo $PATH
if [ "$DISPLAY" = "" ]; then
    i=0
    while [ -e "/tmp/.X11-unix/X$i" ] ; do 
        i=$(( i + 1 ))
    done
    i=$(( i - 1 ))
    display=":$i"
    export DISPLAY=$display
fi
echo "--------------------------------------------------------"
echo "--------------------------------------------------------"

echo $DISPLAY
echo "---------------------------------------------------------"
echo "---------------------------------------------------------"
dpioptions="--high-dpi-support=1 --force-device-scale-factor=$scale --keyboard-height=$keyboardHeight"
sandboxoptions="--no-sandbox"
gpuoptions="--use-gl=egl --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=UseSkiaRenderer,VaapiVideoDecoder --disable-frame-rate-limit --disable-gpu-vsync --enable-oop-rasterization"

echo "launch prospect" 
echo "-----------------------------------------------------------------"
bin/app/prospect-mail $dpioptions $sandboxoptions $gpuoptions
echo "launched prospect"
