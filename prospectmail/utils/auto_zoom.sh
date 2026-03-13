#!/bin/bash
export QML_XHR_ALLOW_FILE_WRITE=1
done="0"
if [ -d /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL ]; then
	echo " already zoomed"
else
	rm -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
	echo "file found....waiting 30s"
	for i in {1..6}; do # you can also use {0..9}
		echo "waiting before zoom"
		a=$((35 - $i * 5))
		${WD}/bin/notify "${a} secondes before zooming connection page"
		${WD}/utils/shortsleep.sh

	done

	echo "I AM ZOOMING"
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/firstinstall
	done="1"
fi
cd /home/phablet/.config/prospectmail.mathias/
file=$(${WD}/utils/ls.sh "zoomtodo*")
echo "----------------------------------------------------------------"
echo $file
if [[ $file == "zoomtodo"* ]]; then

	loop=${file:0-1}

	for i in {1..11}; do # you can also use {0..9}
		echo "waiting before zoom"
		a=$((55 - $i * 5))

		${WD}/bin/notify "${a} secondes before zooming second page"
		${WD}/utils/shortsleep.sh
		${WD}/utils/rm.sh "/home/phablet/.config/prospectmail.mathias/zoomtodo_${i}"
	done

	echo $loop
	echo "--------------------LOOP IS -------------------"$loop

	for ((i = 1; i <= ${loop}; i++)); do
		echo "I AM ZOOMING WITH FLAG autozoom"
		${WD}/utils/zoom.sh
	done
	${WD}/utils/shortsleep.sh
	${WD}/utils/shortsleep.sh
	done="1"
	${WD}/bin/notify "finished zooming :) to reset touch .config/prospectmail.mathias/reset"
fi
if [[ $done == "1"* ]]; then
echo "done"
qmlscene ${WD}/Ok.qml &
fi
