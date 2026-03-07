#!/bin/bash
echo "################################################"
trap 'printf "%3d: " "$LINENO"' DEBUG

if [ -d "/home/phablet/.config/prospectmail.mathias/FIRSTINSTALL" ]; then
          echo " already zoomed"
else
          utils/rm.sh  "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
          qmlscene Main.qml 
          echo "removed file"
fi
