#!/bin/bash
export QML_XHR_ALLOW_FILE_WRITE=1
cd /home/phablet/.config/prospectmail.mathias/
file=$(${WD}/utils/ls.sh "zoomtodo_*")
filereset=$(${WD}/utils/ls.sh "reset")
echo "----------------------------------------------------------------"
echo $file
if [[ $filereset == "reset" ]]; then
	echo "fileresetfound !! not zooming"
	exit 0
fi
if [[ $file == "zoomtodo_"* ]]; then

	loop=${file:0-1}
	
	for i in {1..10}; do
		${WD}/utils/rm.sh "/home/phablet/.config/prospectmail.mathias/zoomtodo_${i}"
	done

	for i in {1..2}; do
		echo "waiting before zoom"
		a=$((15 - $i * 5))

		${WD}/bin/notify "${a} seconds before zooming main page"
		${WD}/utils/shortsleep.sh
	done

	echo $loop
	echo "--------------------LOOP IS -------------------"$loop

	for ((i = 1; i <= ${loop}; i++)); do
		echo "I AM ZOOMING WITH FLAG autozoom"
		${WD}/utils/zoomkey.sh
	done
	${WD}/utils/shortsleep.sh
	${WD}/utils/shortsleep.sh
	done="1"
	${WD}/bin/notify "finished zooming :) to reset touch .config/prospectmail.mathias/reset"
fi
if [[ $done == "1"* ]]; then
	echo "done"
fi
