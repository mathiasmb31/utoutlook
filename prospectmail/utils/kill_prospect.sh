#!/bin/bash
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
echo "]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]]"
${WD}/bin/pkill prospect-mail
${WD}/bin/pkill -9 qmlscene
${WD}/bin/pkill prospect-mail
${WD}/bin/pkill -9 prospect-mail
${WD}/utils/quicksleep.sh
${WD}/bin/pkill -9 command.sh
${WD}/bin/rm -f /home/phablet/.cache/prospectmail.mathias/opened
pid=`${WD}/bin/ls -l  /proc/*/exe 2>/dev/null | ${WD}/bin/grep "prospect-mail" | grep -v daemon  |  ${WD}/bin/awk -F'/' '{print $3}'`
for i in $pid; 
do
 kill -9 $i
done
pid=`${WD}/bin/ls -l  /proc/*/exe 2>/dev/null | ${WD}/bin/grep "qmlscene"  |  ${WD}/bin/awk -F'/' '{print $3}'`

for i in $pid; 
do
 kill -9 $i
done


pid=`${WD}/bin/ls -l  /proc/*/exe 2>/dev/null | ${WD}/bin/grep "bash"  |  ${WD}/bin/awk -F'/' '{print $3}'`

for i in $pid; 
do
 kill -9 $i
done
