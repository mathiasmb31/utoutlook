#!/bin/bash
# Kill all prospect-mail processes and clean up locks/flags
# Requires: ${WD} set + common.sh sourced (or source it here)

# Source common.sh if not already loaded
if [ -z "${UTOUTLOOK_CONFIG_DIR}" ]; then
	source "${WD}/utils/common.sh"
fi

utoutlook_kill_app
"${WD}"/utils/quicksleep.sh

# Remove singleton lock files
utoutlook_cleanup_locks

# Kill any remaining prospect-mail processes by scanning /proc
utoutlook_kill_by_proc

# Clean up cache flag
"${WD}/bin/rm" -f "${UTOUTLOOK_CACHE_DIR}/opened" 2>/dev/null || true
