#!/bin/bash
set -x
function verify_prospect_life() {
	pid=$(${WD}/bin/ls -l /proc/*/exe 2>/dev/null | ${WD}/bin/grep "prospect-mail" | ${WD}/bin/awk -F'/' '{print $3}')

	echo " ////////////result/////////// : "${pid}
	if [ -z "$pid" ]; then
		echo "prospect mail not detected"
		${WD}/utils/kill_prospect.sh
		exit 0
	fi
	if [-f '/home/phablet/.cache/prospectmail.mathias/opened' ]; then
		pid=$(${WD}/bin/ls -l /proc/*/exe 2>/dev/null | ${WD}/bin/grep "qmlscene" | ${WD}/bin/awk -F'/' '{print $3}')
		if [ -z "$pid" ]; then
			echo "qmlscene not detected, must have been killed"
			${WD}/utils/kill_prospect.sh
			exit 0
		fi
	fi
}
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG

export QML_XHR_ALLOW_FILE_WRITE=1

export LD_LIBRARY_PATH="$LD_LIBRARY_PATH:$WD/lib/aarch64-linux-gnu/"
if [ "$DISPLAY" = "" ]; then
	i=0
	while [ -e "/tmp/.X11-unix/X$i" ]; do
		i=$((i + 1))
	done
	i=$((i - 1))
	display=":$i"
	export DISPLAY=$display
fi

while [ true ]; do
	cd /home/phablet/.cache/prospectmail.mathias/
	file=$(${WD}/utils/ls.sh "sendMsg*")
	echo ${file}
	if [ -f "${file}" ]; then
		echo "##############################send msg loop###############################"
		${WD}/bin/notify "Slide to window receiving text"
		msg=$(${WD}/utils/ls.sh "$file")
		msg1=$(${WD}/utils/cut.sh "${msg}")
		echo "................."$msg1
		${WD}/utils/rm.sh /home/phablet/.cache/prospectmail.mathias/"${file}"
		${WD}/bin/xdotool type "${msg1}"
	fi
	echo "lauching autozoom "
	${WD}/utils/auto_zoom.sh &
	verify_prospect_life
done
