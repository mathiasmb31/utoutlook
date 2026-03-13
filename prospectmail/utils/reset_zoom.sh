#!/bin/bash
echo "..launch this script in  directory utils...."
rm -rf  /home/phablet/.config/prospectmail.mathias/FIRSTINSTALL

./rm.sh /home/phablet/.config/prospectmail.mathias/prospect-mail/Preferences
../bin/notify "Reset done...launch now prospectmail"
