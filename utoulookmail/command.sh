#!/bin/bash

trap close_command EXIT

function sleep_int() {
	"${WD}"/bin/sleep $1

}

function cleanup() {

	utoutlook_kill_app
	utoutlook_cleanup_locks
	"${WD}"/bin/rm -f "${UTOUTLOOK_EXITCOMMAND}" 2>/dev/null || true
}

function launch_prospect() {
	cleanup
	if [[ -f ${lock} ]]; then
		utoutlook_notify "$(utoutlook_t 'shell.waitClose')"
	fi
	launchtry=$((launchtry + 1))
	if [ "$launchtry" -gt 3 ]; then
		cleanup
		echo "tried too more " >${exitcommand}
		qmlscene "${WD}"/qml/nonetwork.qml
		exit 0
	fi
	export APPDIR=${WD}/bin/App/
	# Wait for notification service to be ready before sending welcome
	# (D-Bus Postal may not be up yet on first launch / boot)
	utoutlook_wait_notifications 15
	utoutlook_notify "$(utoutlook_t 'shell.welcome')"

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
		echo "******" && utoutlook_notify "$(utoutlook_t 'shell.cleaning')" && exit 0
	else
		clientalive=1
		touch ${lock}
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

		utoutlook_notify "$(utoutlook_t 'shell.noNetwork')"
		qmlscene "${WD}"/qml/nonetwork.qml
		close_command
	fi
}
function close_command() {
	# Send quit command via Unix socket (primary method)
	utoutlook_send_socket_cmd '{"cmd":"quit"}'
	# Fallback: write close flag file (picked up by heartbeat)
	echo "closed" >"${UTOUTLOOK_EXITCOMMAND}"
	utoutlook_notify "$(utoutlook_t 'shell.goodbye')"
	exit 0
}

export WD=$(pwd)
echo "$WD"

# Source shared functions and path constants
source "${WD}/utils/common.sh"

# D-Bus session bus — required by the notify binary (QDBusConnection::sessionBus).
# Lomiri normally sets these, but be defensive: if they are missing, the notify
# binary silently fails and welcome notifications never appear.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

# Alias legacy variable names to common.sh constants (avoids changing every reference)
export lock="${UTOUTLOOK_LOCK}"
export lockcook="${UTOUTLOOK_LOCKCOOK}"
export locksock="${UTOUTLOOK_LOCKSOCK}"
export exitclient="${UTOUTLOOK_EXITCLIENT}"
export killedclient="${UTOUTLOOK_KILLEDCLIENT}"
export filelifefollow="${UTOUTLOOK_FILELIFE}"
export exitcommand="${UTOUTLOOK_EXITCOMMAND}"
export socketpath="${UTOUTLOOK_SOCKET}"

###init
declare -i i=0
test_net
export launchtry=1

oldfollow="0"
"${WD}"/bin/rm -f ${exitclient}
"${WD}"/bin/rm -f ${killedclient}
"${WD}"/bin/rm -f /home/phablet/.config/utoutlook.mathias/close
cleanup
"${WD}"/utils/mkdir
"${WD}"/bin/rm -f "/home/phablet/.cache/utoutlook.mathias/quit"
"${WD}"/bin/rm -f "/home/phablet/.config/utoutlook.mathias/close"
echo "################################################"
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
gpuoptions="--disable-gpu --disable-gpu-compositing --disable-software-rasterizer --disable-features=VaapiVideoDecoder,AcceleratedVideoDecoder"

echo "launch utoutlookmail"

echo "----------------------------------------------------------------------"

echo "----------------------------------------------------------------------"
launch_prospect
sleep_int 15
while true; do
	sleep_int 3

	verify_prospect_life

done
