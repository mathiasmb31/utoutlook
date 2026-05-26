#!/bin/bash -e
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
FLAG_FIRST_INSTALL=/home/phablet/.config/prospectmail.mathias/data/FIRSTINSTALL
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
if [ -f ${FLAG_FIRST_INSTALL} ]; then
	echo "not a first install"
else
	echo " doing first install"
	echo "--------------------"
	echo $ROOT
	#cp  $ROOT/settings.json /home/phablet/.config/prospectmail.mathias/"Prospect Mail"/settings.json
	echo "copied good settings ..remove tray"
	touch $FLAG_FIRST_INSTALL
fi
