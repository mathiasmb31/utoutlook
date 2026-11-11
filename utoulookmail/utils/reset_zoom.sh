#!/bin/bash
set -x
echo "..launch this script in  directory utils...."
WD="$(cd "$(dirname "$0")/.." && pwd)"
source "${WD}/utils/common.sh"
./rmdir.sh ${HOME}/.config/utoutlook.mathias/FIRSTINSTALL
./rm.sh ${HOME}/.config/utoutlook.mathias/reset
./rm.sh ${HOME}/.config/utoutlook.mathias/prospect-mail/Preferences
utoutlook_notify "$(utoutlook_t 'shell.resetDone')"
