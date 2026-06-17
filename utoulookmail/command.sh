#!/bin/bash
function verify_prospect_life() {
	pid=$(${WD}/bin/ls -l /proc/*/exe 2>/dev/null | ${WD}/bin/grep "prospect-mail" | ${WD}/bin/awk -F'/' '{print $3}')

	echo " ////////////result/////////// : "${pid}
	if [ -z "$pid" ]; then
		echo "prospect mail not detected"
		${WD}/utils/kill_prospect.sh
		exit 0
	fi
	if [-f '/home/phablet/.cache/utoutlook.mathias/opened' ]; then
		pid=$(${WD}/bin/ls -l /proc/*/exe 2>/dev/null | ${WD}/bin/grep "qmlscene" | ${WD}/bin/awk -F'/' '{print $3}')
		if [ -z "$pid" ]; then
			echo "qmlscene not detected, must have been killed"
			${WD}/utils/kill_prospect.sh
			exit 0
		fi
	fi
}

function test_net() {
	if ${WD}/bin/nc -zw1 google.com 443; then
  		echo "we have connectivity"
	else
	
		${WD}/bin/notify "No network access..quit"
		exit 0
	fi
}
function close_command() {
	${WD}/bin/pkill -9 qmlscene
	${WD}/bin/pkill -9 prospect-mail
	${WD}/bin/pkill -9 prospect-mail
	${WD}/utils/quicksleep.sh
	${WD}/bin/rm -f ${lock}
	${WD}/bin/rm -f ${lockcook}
	${WD}/bin/rm -f ${locksock}
	echo "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@"

}
set -ax
export WD=$(pwd)
echo $WD

###init
test_net
export lock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonLock"
export lockcook="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonCookie"
export locksock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonSocket"
test -L $lock && close_command
test -L $lockcook && close_command
test -L $locksock && close_command
utils/close.sh
utils/mkdir
${WD}/bin/rm -f "/home/phablet/.cache/utoutlook.mathias/quit"
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
utils/verify_flag.sh
echo "---------------------------------------------------------"
echo "---------------------------------------------------------"
dpioptions="--high-dpi-support=1 --force-device-scale-factor=$scale --keyboard-height=$keyboardHeight"
sandboxoptions="--no-sandbox"
gpuoptions="--use-gl=egl --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=UseSkiaRenderer,VaapiVideoDecoder --disable-frame-rate-limit --disable-gpu-vsync --enable-oop-rasterization"
echo "launch prospect"
echo "-----------------------------------------------------------------"
(
	${WD}/utils/menusettings.sh 
) &

echo "----------------------------------------------------------------------"

echo "----------------------------------------------------------------------"
${WD}/utils/quicksleep.sh
export APPDIR=${WD}/bin/App/
#${WD}/bin/nohup ${WD}/bin/App/AppRun $dpioptions $sandboxoptions $gpuoptions &
${WD}/bin/App/prospect-mail $dpioptions $sandboxoptions $gpuoptions &
${WD}/utils/sleep.sh
${WD}/bin/nohup utils/daemon.sh &
while [ true ]; do
	${WD}/utils/quicksleep.sh
	echo "====================================================================="
	pid=$(${WD}/bin/ls -l /proc/*/exe 2>/dev/null | ${WD}/bin/grep "prospect" | ${WD}/bin/awk -F'/' '{print $3}')
	echo $pid
	verify_prospect_life

done
