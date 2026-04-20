#!/bin/bash
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
export filequit="/home/phablet/.cache/prospectmail.mathias/quit"
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

while [ true ]
do
	${WD}/utils/quicksleep.sh
	cd /home/phablet/.cache/prospectmail.mathias/
	file=$(${WD}/utils/ls.sh "sendMsg*")
	echo ${file}
	if [ -f "${file}" ]; then
		echo "##############################send msg loop###############################"
		${WD}/utils/quicksleep.sh
		${WD}/bin/notify "Slide to window receiving text"
		msg=`${WD}/utils/ls.sh "$file"`
		msg1=`${WD}/utils/cut.sh "${msg}"`
		echo "................."$msg1
		${WD}/utils/rm.sh /home/phablet/.cache/prospectmail.mathias/"${file}"
		${WD}/utils/quicksleep.sh
		${WD}/utils/quicksleep.sh
		${WD}/bin/xdotool type "${msg1}"
	fi
	echo "lauching autozoom "
	${WD}/utils/auto_zoom.sh
	${WD}/utils/quicksleep.sh
done
