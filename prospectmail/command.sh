#!/bin/bash -e

set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
echo $SNAP
export WD=${PWD}
echo "Going to launch"
echo "GRID UNIT PX"$GRID_UNIT_PX
export DISPLAY=:0.0
export QT_FILE_SELECTORS=ubuntu-touch

dpioptions="--high-dpi-support=1 --force-device-scale-factor=1 --grid-unit-px=1"
sandboxoptions="--no-sandbox"
gpuoptions="--use-gl=egl --disable-dev-shm-usage"
echo "------------------------------------------------------------------"
echo $$ >>/home/phablet/.config/prospectmail.mathias/data/__prospect.pid
utils/auto_zoom.sh &
export PATH=$PWD/bin:$PATH
echo $PATH
$SNAP/app/prospect-mail $dpioptions $sandboxoptions $gpuoptions
