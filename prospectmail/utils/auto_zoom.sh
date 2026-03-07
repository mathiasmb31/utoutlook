#!/bin/bash

pwd

if [ -d /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL ]; then
          echo " already zoomed"
else
          rm -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
          echo "file found....waiting 30s"
          for i in {1..8}; do # you can also use {0..9}
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


if [ -f /home/phablet/.config/prospectmail.mathias/zoomtodo ]; then
loop=`${WD}/utils/cat.sh /home/phablet/.config/prospectmail.mathias/zoomtodo`
echo "--------------------LOOP IS -------------------"$loop
${WD}/utils/rm.sh /home/phablet/.config/prospectmail.mathias/zoomtodo
 for i in {1..10}; do # you can also use {0..9}
                    echo "waiting before zoom"
                    ${WD}/utils/shortsleep.sh
          done
for (( i=1; i<=$loop; i++ )); do
		echo "I AM ZOOMING WITH FLAG autozoom"
          ${WD}/utils/zoom.sh
done
	
fi

echo "done"
