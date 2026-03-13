#!/bin/bash
export QML_XHR_ALLOW_FILE_WRITE=1

if [ -d /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL ]; then
	echo " already zoomed"
else
	rm -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
	echo "file found....waiting 30s"
	for i in {1..8}; do # you can also use {0..9}
		echo "waiting before zoom"
		a=$((45 - $i * 5))
		${WD}/bin/notify "${a} secondes before zooming first page"
		${WD}/utils/shortsleep.sh

	done

	echo "I AM ZOOMING"
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/firstinstall
fi
cd /home/phablet/.config/prospectmail.mathias/
file=$(${WD}/utils/ls.sh "zoomtodo*")
echo "----------------------------------------------------------------"
echo $file
if [[ $file == "zoomtodo"* ]]; then

	loop=${file:0-1}

	for i in {1..10}; do # you can also use {0..9}
		echo "waiting before zoom"
		a=$((50 - $i * 5))

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
	${WD}/bin/notify "finished zooming :) to reset in utils/reset_zoom.sh"
fi

echo "done"
