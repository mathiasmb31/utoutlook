#!/bin/bash
export QML_XHR_ALLOW_FILE_WRITE=1

if [ -f /home/phablet/.config/utoutlook.mathias/reset ]; then
	echo "RESET!!!!!!"
	cd "${WD}/utils"
	./reset_zoom.sh
	cd ..
	echo "*********************************** launching settings"
	utils/rm.sh "/home/phablet/.config/utoutlook.mathias/prospect-mail/Preferences"
	echo "removed file"
fi
