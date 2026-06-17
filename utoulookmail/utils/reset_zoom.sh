#!/bin/bash
set -x
echo "..launch this script in  directory utils...."
./rmdir.sh /home/phablet/.config/utoutlook.mathias/FIRSTINSTALL
./rm.sh /home/phablet/.config/utoutlook.mathias/reset
./rm.sh /home/phablet/.config/utoutlook.mathias/prospect-mail/Preferences
../bin/notify "Reset done...launch now prospectmail"
