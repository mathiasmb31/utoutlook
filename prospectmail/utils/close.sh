#!/bin/bash
set -x
trap 'printf "%3d: " "$LINENO"' DEBUG
PIDFILE="/home/phablet/.config/prospectmail.mathias/data/__prospect.pid"
echo "##################################################################"

if [ -f $PIDFILE ]; then
	echo "----kill old process----"
	pid=""
	while IFS= read -r line; do
		pid=${line}
		echo $pid" ******pid*********"
		kill -9 ${pid}
	done <$PIDFILE
	echo "" >${PIDFILE}
else
	echo "---no pidfile found"
fi

echo " ------------done----------"
