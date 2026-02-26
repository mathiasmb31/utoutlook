#!/bin/bash

pwd 


if [ -d /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL ]; then
	echo " already zoomed"
else
	rm -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
	until [ -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences" ]
	do
     sleep 5
     echo "waiting for file"
	done
	echo "file found....waiting 30s"
	for i in {1..5}   # you can also use {0..9}
		do
			echo "waiting before zoom"
  			 ${WD}/utils/shortsleep.sh
		done

	echo "I AM ZOOMING"
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
	${WD}/utils/zoom.sh
        ${WD}/utils/zoom.sh
       ${WD}/utils/firstinstall	
fi
echo "done"
