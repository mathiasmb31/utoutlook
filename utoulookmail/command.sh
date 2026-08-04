#!/bin/bash


trap close_command EXIT
trap close_command 9
trap close_command 3
trap close_command 1
trap close_command 6
trap close_command 2

function cleanup() {

 ${WD}/bin/pkill -9 prospect-mail
       ${WD}/bin/pkill -9 prospect-mail
       ${WD}/bin/pkill -9 prospect-mail
       ${WD}/bin/pkill  prospect-mail
       ${WD}/bin/pkill  prospect-mail
       ${WD}/utils/quicksleep.sh
       ${WD}/bin/rm -f ${lock}
       ${WD}/bin/rm -f ${lockcook}
       ${WD}/bin/rm -f ${locksock}
}

function launch_prospect() {
	${WD}/utils/quicksleep.sh
	export APPDIR=${WD}/bin/App/
	${WD}/bin/notify "Launch prospect"
	${WD}/bin/App/prospect-mail $dpioptions $sandboxoptions $gpuoptions &
	${WD}/utils/sleep.sh
}

function verify_prospect_life() {

echo "todo :)"

}

function test_net() {
	if ${WD}/bin/nc -zw1 google.com 443; then
  		echo "we have connectivity"
	else
	
		${WD}/bin/notify "No network access..quit"
		close_command
		exit 0
	fi
}
function close_command() {
	
	
    echo "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@" > /home/phablet/.config/utoutlook.mathias/close
	${WD}/bin/notify "Clean up utoulookmai"

	${WD}/bin/rm -f ${lock}
	${WD}/bin/rm -f ${lockcook}
	${WD}/bin/rm -f ${locksock}
	cleanup	
	exit 0
}
set -ax
export WD=$(pwd)
echo $WD

###init

test_net

export lock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonLock"
export lockcook="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonCookie"
export locksock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonSocket"
cleanup
utils/mkdir
${WD}/bin/rm -f "/home/phablet/.cache/utoutlook.mathias/quit"
${WD}/bin/rm -f "/home/phablet/.config/utoutlook.mathias/close"

echo "################################################"
trap 'printf "%3d: " "$LINENO"' DEBUG
export GDK_SCALE=2
export GTK_IM_MODULE=Maliit
export GTK_IM_MODULE_FILE=/home/phablet/.config/utoutlook.mathias/immodules.cache
export GDK_BACKEND=x11
export DISABLE_WAYLAND=1
export DCONF_PROFILE=/nonexistent
export XDG_CONFIG_HOME=/home/phablet/.config/utoutlook.mathias/
export XDG_DATA_HOME=/home/phablet/.config/utoutlook.mathias/
export XDG_DESKTOP_DIR=/home/phablet/.config/utoutlook.mathias/
export LD_LIBRARY_PATH=$PWD/lib/aarch64-linux-gnu/
trap 'printf "%3d: " "$LINENO"' DEBUG

echo "\"$PWD/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/im-maliit.so\"" >/home/phablet/.config/utoutlook.mathias/immodules.cache
echo "\"Maliit\" \"Maliit Input Method\" \"maliit\" \"\" \"en:ja:ko:zh:*\"" >>/home/phablet/.config/utoutlook.mathias/immodules.cache
echo 'XDG_DESKTOP_DIR="/home/phablet/.cache/utoutlook.mathias/downloads/"' >/home/phablet/.config/utoutlook.mathias/user-dirs.dirs

echo "Going to launch"
echo "GRID UNIT PX"$GRID_UNIT_PX
export QT_FILE_SELECTORS=ubuntu-touch



## cleanup 
  cleanup    
        

echo "------------------------------------------------------------------"
echo $$ >>/home/phablet/.config/utoutlook.mathias/data/__prospect.pid

export PATH=$WD/bin:$PATH
echo $PATH
if [ "$DISPLAY" = "" ]; then
	i=0
	while [ -e "/tmp/.X11-unix/X$i" ]; do
		i=$((i + 1))
	done
	i=$((i - 1))
	display=":$i"
	export DISPLAY=$display
fi
echo "--------------------------------------------------------"
echo "--------------------------------------------------------"

echo $DISPLAY
${WD}/utils/verify_flag.sh
echo "---------------------------------------------------------"
echo "---------------------------------------------------------"

if [ "$textFontSize" = "" ]; then
textFontSize=120
fi

if [ "$spanFontSize" = "" ]; then
spanFontSize=100
fi
appScaling=$(${WD}/utils/get-scale.sh 2>/dev/null )

scaling="$((appScaling / 115)).$(printf '%02d' "$((appScaling % 115))")"


dpioptions="--high-dpi-support=1 --force-device-scale-factor=$scaling  --text-font-size=$textFontSize --span-font-size=$spanFontSize"
sandboxoptions="--no-sandbox"
gpuoptions="--use-gl=egl --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=UseSkiaRenderer,VaapiVideoDecoder --disable-frame-rate-limit --disable-gpu-vsync --enable-oop-rasterization"

echo "launch utoutlookmail"

echo "----------------------------------------------------------------------"

echo "----------------------------------------------------------------------"
launch_prospect

while [ true ]; do
	${WD}/utils/sleep.sh
       verify_prospect_life

done
