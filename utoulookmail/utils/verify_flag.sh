#!/bin/bash
set -x
echo "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

export QML_XHR_ALLOW_FILE_WRITE=1

echo "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
trap 'printf "%3d: " "$LINENO"' DEBUG
if [ -f /home/phablet/.config/utoutlook.mathias/reset ]; then
	echo "RESET!!!!!!"
	cd ${WD}/utils
	./reset_zoom.sh
	cd ..
	echo "*********************************** launching settings"
	utils/rm.sh "/home/phablet/.config/utoutlook.mathias/prospect-mail/Preferences"
	echo "removed file"
fi
