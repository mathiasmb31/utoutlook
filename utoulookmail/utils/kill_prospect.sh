#!/bin/bash
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
echo "]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]"
${WD}/bin/pkill prospect-mail
${WD}/bin/pkill -9 qmlscene
${WD}/bin/pkill prospect-mail
${WD}/bin/pkill -9 prospect-mail
${WD}/utils/quicksleep.sh
${WD}/bin/rm -f /home/phablet/.cache/utoutlook.mathias/opened
pid=$(${WD}/bin/ls -l /proc/*/exe 2>/dev/null | ${WD}/bin/grep "prospect-mail" | grep -v daemon | ${WD}/bin/awk -F'/' '{print $3}')
export lock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonLock"
export lockcook="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonCookie"
export locksock="/home/phablet/.config/utoutlook.mathias/prospect-mail/SingletonSocket"
${WD}/bin/rm -f ${lock}
	${WD}/bin/rm -f ${lockcook}
	${WD}/bin/rm -f ${locksock}
for i in $pid; do
	kill -9 $i
done

