#!/bin/bash 
set -x
WD=${PWD}
utils/close.sh
utils/mkdir
utils/copy.sh ${WD}/utils/settings.json "/home/phablet/.config/prospectmail.mathias/"
echo "################################################"
trap 'printf "%3d: " "$LINENO"' DEBUG
export SNAP=$PWD/bin/
export SNAP_DESKTOP_LAST_REVISION="3"
export SNAP_REVISION="3"

export GTK_IM_MODULE=Maliit
export GTK_IM_MODULE_FILE=$PWD/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/immodules.cache
export DCONF_PROFILE=/nonexistent
export XDG_CONFIG_HOME=/home/phablet/.config/prospectmail.mathias/
export LD_LIBRARY_PATH=$PWD/lib/aarch64-linux-gnu:$LD_LIBRARY_PATH
export MALIIT_SOCKET_ADDRESS=unix:path=/run/user/32011/maliit
export GTK_MODULES=gail:atk-bridge:maliitplatforminputcontextplugin
export QT_IM_MODULE=maliit
export XMODIFIERS=@im=Maliit
export SNAP_USER_COMMON=/home/phablet/.config/prospectmail.mathias/common
export SNAP_USER_DATA=/home/phablet/.config/prospectmail.mathias/data
export XDG_DATA_HOME=/home/phablet/.config/prospectmail.mathias/data
echo "Environment variables set"
echo "GTK_IM_MODULE=$GTK_IM_MODULE"
echo "GTK_IM_MODULE_FILE=$GTK_IM_MODULE_FILE"
echo "LD_LIBRARY_PATH=$LD_LIBRARY_PATH"
echo "Launching background dummy app..."

echo "pid of actual process is :"$$
echo $$ >/home/phablet/.config/prospectmail.mathias/data/__prospect.pid
#Open dummy qt gui app to realease lomiri from its waiting
(
          utils/sleep.sh
          $PWD/bin/xdg-open
) &
echo "----------- launch firstinstall"
echo "00000000000000000000000000000000000000000000000000000000000000000000"
utils/verify_flag.sh
echo " start prospect-mail"

$SNAP/command.sh
