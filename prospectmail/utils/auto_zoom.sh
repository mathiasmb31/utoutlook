#!/bin/bash

pwd

if [ -d /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL ]; then
          echo " already zoomed"
else
          rm -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
          until [ -f "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences" ]; do
                    sleep 5
                    echo "waiting for file"
          done
          echo "file found....waiting 30s"
          for i in {1..5}; do # you can also use {0..9}
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

${WD}/utils/rm.sh /home/phablet/.config/prospectmail.mathias/zoomtodo
loop=`${WD}/utils/cat.sh /home/phablet/.config/prospectmail.mathias/zoomtodo`
 for i in {1..10}; do # you can also use {0..9}
                    echo "waiting before zoom"
                    ${WD}/utils/shortsleep.sh
          done
for i in {0..${loop}}
do
  echo "I AM ZOOMING WITH FLAG autozoom"
          ${WD}/utils/zoom.sh
done
	
fi

echo "done"
