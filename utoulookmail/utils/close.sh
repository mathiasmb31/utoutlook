#!/bin/bash
# Kill prospect-mail via PID file
# Requires: ${WD} set + common.sh sourced (or source it here)

# Source common.sh if not already loaded
if [ -z "${UTOUTLOOK_CONFIG_DIR}" ]; then
	source "${WD}/utils/common.sh"
fi

PIDFILE="${UTOUTLOOK_PID_FILE}"
echo "##################################################################"

if [ -f "$PIDFILE" ]; then
	echo "----kill old process----"
	while IFS= read -r pid; do
		echo "${pid} ******pid*********"
		kill -9 "${pid}" 2>/dev/null || true
	done <"$PIDFILE"
	echo "" >"$PIDFILE"
else
	echo "---no pidfile found"
fi

echo " ------------done----------"
