#!/bin/bash
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
pid=`${WD}/bin/ls -l  /proc/*/exe 2>/dev/null | ${WD}/bin/grep "prospect-mail"  |  ${WD}/bin/awk -F'/' '{print $3}'`
for i in ${pid}; do
 if test ${i} -eq $$ ;then
	echo "same pid"
	else
    kill -9 ${i}	
 fi 
${WD}/bin/pkill prospect-mail
kill -9 `pgrep command.sh`
kill -9 `pgrep prospect-mail`
kill -9 `pgrep daemon.sh`
kill -9 `pgrep menusettings.sh`

done
