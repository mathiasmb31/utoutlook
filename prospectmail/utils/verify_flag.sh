#!/bin/bash
export QML_XHR_ALLOW_FILE_WRITE=1
echo "################################################"
trap 'printf "%3d: " "$LINENO"' DEBUG

if [ -d "/home/phablet/.config/prospectmail.mathias/FIRSTINSTALL" ]; then
          echo " already zoomed"
else
	 echo "*********************************** launching settings"
          utils/rm.sh  "/home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences"
          qmlscene Main.qml 
          echo "removed file"
fi
