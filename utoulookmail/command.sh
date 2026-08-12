#!/bin/bash

trap close_command 1
trap close_command 3
trap close_command 6
trap close_command 1
trap close_command 15

function sleep_int() {

	for ((target = $((SECONDS + $1)); SECONDS < target; true)); do :; done
}

function cleanup() {

	"${WD}"/bin/pkill -9 prospect-mail
	"${WD}"/bin/pkill -9 prospect-mail
	"${WD}"/bin/pkill -9 prospect-mail
	"${WD}"/bin/pkill prospect-mail
	"${WD}"/bin/pkill prospect-mail
	"${WD}"/bin/rm -f ${lock}
	"${WD}"/bin/rm -f ${lockcook}
	"${WD}"/bin/rm -f ${locksock}
	"${WD}"/bin/rm -f ${exitclient}
	"${WD}"/bin/rm -f ${killedclient}
	"${WD}"/bin/rm -f "/home/phablet/.config/utoutlook.mathias/close"
	"${WD}"/bin/rm -f ${exitcommand}
}

function launch_prospect() {
	cleanup

	launchtry=$((launchtry + 1))
	if [ "$launchtry" -gt 3 ]; then
		cleanup
		echo "tried too more " >${exitcommand}
		qmlscene "${WD}"/qml/nonetwork.qml
		exit 0
	fi
	export APPDIR=${WD}/bin/App/
	"${WD}"/bin/notify "Launch prospect"

	"${WD}"/bin/App/prospect-mail "$dpioptions" "$sandboxoptions" "$gpuoptions" &
	i+=1
}

function verify_prospect_life() {

	follow=$(echo "$(<${filelifefollow})")

	echo "FOLLOW"
	echo ${follow}
	echo ${oldfollow}
	clientalive=0
	if [ ${follow} -eq ${oldfollow} ]; then
		echo ${follow}
		echo ${oldfollow}
		echo "tried too more " >${exitcommand}
		echo "******" && qmlscene "${WD}"/qml/exit.qml && exit 0
	else
		clientalive=1
	fi
	oldfollow=${follow}
	if [ ${clientalive} -eq 1 ]; then
		echo "client is alive"
	else

		if [ -f ${killedclient} ] && [! -f ${exitclient} ]; then
			sleep_int 1
			launch_prospect
		fi
		if [ -f ${exitclient} ]; then
			exit 0
		fi
	fi
	echo "done"
}

function test_net() {
	if "${WD}"/bin/nc -zw1 google.com 443; then
		echo "we have connectivity"
	else

		"${WD}"/bin/notify "No network access..quit"
		qmlscene "${WD}"/qml/nonetwork.qml
		close_command
	fi
}
function close_command() {

	echo "closed" >/home/phablet/.config/utoutlook.mathias/close
	"${WD}"/bin/notify "Clean up utoulookmai"

	exit 0
}

export WD=$(pwd)
echo "$WD"

###init
declare -i i=0

test_net
export launchtry=1
export lock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonLock"
export lockcook="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonCookie"
export locksock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonSocket"
export exitclient="/home/phablet/.config/utoutlook.mathias/exitclient"
export killedclient="/home/phablet/.config/utoutlook.mathias/killedmail"
export filelifefollow="/home/phablet/.config/utoutlook.mathias/follow"
export exitcommand="/home/phablet/.config/utoutlook.mathias/close"
oldfollow="0"
"${WD}"/bin/rm -f ${exitclient}
"${WD}"/bin/rm -f ${killedclient}
"${WD}"/bin/rm -f /home/phablet/.config/utoutlook.mathias/close
cleanup
utils/mkdir
"${WD}"/bin/rm -f "/home/phablet/.cache/utoutlook.mathias/quit"
"${WD}"/bin/rm -f "/home/phablet/.config/utoutlook.mathias/close"

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
echo "GRID UNIT PX""$GRID_UNIT_PX"
export QT_FILE_SELECTORS=ubuntu-touch

## cleanup
cleanup
numberold=$(echo "$(<${filelifefollow})")

echo "------------------------------------------------------------------"
echo $$ >>/home/phablet/.config/utoutlook.mathias/data/__prospect.pid

export PATH=$WD/bin:$PATH
echo "$PATH"
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

echo "$DISPLAY"
"${WD}"/utils/verify_flag.sh
echo "---------------------------------------------------------"
echo "---------------------------------------------------------"

if [ "$textFontSize" = "" ]; then
	textFontSize=120
fi

if [ "$spanFontSize" = "" ]; then
	spanFontSize=100
fi
appScaling=$("${WD}"/utils/get-scale.sh 2>/dev/null)

scaling="$((appScaling / 115)).$(printf '%02d' "$((appScaling % 115))")"

dpioptions="--high-dpi-support=1 --force-device-scale-factor=$scaling  --text-font-size=$textFontSize --span-font-size=$spanFontSize"
sandboxoptions="--no-sandbox"
gpuoptions="--use-gl=egl --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --enable-features=UseSkiaRenderer,VaapiVideoDecoder --disable-frame-rate-limit --disable-gpu-vsync --enable-oop-rasterization"

echo "launch utoutlookmail"

echo "----------------------------------------------------------------------"

echo "----------------------------------------------------------------------"
launch_prospect
sleep_int 15
while true; do
	sleep_int 3

	verify_prospect_life

done
