#!/bin/bash
set -x
echo "..launch this script in  directory utils...."
WD="$(cd "$(dirname "$0")/.." && pwd)"
source "${WD}/utils/common.sh"
./rmdir.sh /home/phablet/.config/utoutlook.mathias/FIRSTINSTALL
./rm.sh /home/phablet/.config/utoutlook.mathias/reset
./rm.sh /home/phablet/.config/utoutlook.mathias/prospect-mail/Preferences
../bin/notify "$(utoutlook_t 'shell.resetDone')"
