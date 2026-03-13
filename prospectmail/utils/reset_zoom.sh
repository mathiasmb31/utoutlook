#!/bin/bash
set -x
echo "..launch this script in  directory utils...."
./rmdir.sh /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL
./rm.sh /home/phablet/.config/prospectmail.mathias/reset
./rm.sh /home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences
../bin/notify "Reset done...launch now prospectmail"
