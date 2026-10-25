#!/bin/bash
# ============================================================
# common.sh — Shared shell functions for Utoutlook Mail
# Source this file: source "${WD}/utils/common.sh"
# Requires: ${WD} to be set (app install directory)
# ============================================================

# --- Path constants ---
export UTOUTLOOK_CONFIG_DIR="/home/phablet/.config/utoutlook.mathias"
export UTOUTLOOK_CACHE_DIR="/home/phablet/.cache/utoutlook.mathias"
export UTOUTLOOK_DATA_DIR="${UTOUTLOOK_CONFIG_DIR}/data"
export UTOUTLOOK_PID_FILE="${UTOUTLOOK_DATA_DIR}/__prospect.pid"

# Singleton lock files (Electron)
export UTOUTLOOK_LOCK="${UTOUTLOOK_CONFIG_DIR}/prospect-mail/SingletonLock"
export UTOUTLOOK_LOCKCOOK="${UTOUTLOOK_CONFIG_DIR}/prospect-mail/SingletonCookie"
export UTOUTLOOK_LOCKSOCK="${UTOUTLOOK_CONFIG_DIR}/prospect-mail/SingletonSocket"

# IPC flag files
export UTOUTLOOK_EXITCLIENT="${UTOUTLOOK_CONFIG_DIR}/exitclient"
export UTOUTLOOK_KILLEDCLIENT="${UTOUTLOOK_CONFIG_DIR}/killedmail"
export UTOUTLOOK_FILELIFE="${UTOUTLOOK_CONFIG_DIR}/follow"
export UTOUTLOOK_EXITCOMMAND="${UTOUTLOOK_CONFIG_DIR}/close"
export UTOUTLOOK_SOCKET="${UTOUTLOOK_CONFIG_DIR}/utoutlook.sock"

# --- Binary shortcuts (embedded in click, AppArmor-confined) ---
UTOUTLOOK_BIN="${WD}/bin"

# ============================================================
# Send a JSON command to the Electron app via Unix socket
# Usage: utoutlook_send_socket_cmd '{"cmd":"quit"}'
# ============================================================
utoutlook_send_socket_cmd() {
	python3 -c "
import socket, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(2)
    s.connect('${UTOUTLOOK_SOCKET}')
    s.sendall((sys.argv[1] + '\n').encode())
    s.close()
except Exception:
    pass
" "$1" 2>/dev/null || true
}

# ============================================================
# Kill all prospect-mail processes
# ============================================================
utoutlook_kill_app() {
	"${UTOUTLOOK_BIN}/pkill" -9 prospect-mail 2>/dev/null || true
	"${UTOUTLOOK_BIN}/pkill" -9 qmlscene 2>/dev/null || true
}

# ============================================================
# Remove Electron singleton lock files
# ============================================================
utoutlook_cleanup_locks() {
	"${UTOUTLOOK_BIN}/rm" -f "${UTOUTLOOK_LOCK}" "${UTOUTLOOK_LOCKCOOK}" "${UTOUTLOOK_LOCKSOCK}" 2>/dev/null || true
}

# ============================================================
# Remove IPC flag files (exitclient, killedmail, close)
# ============================================================
utoutlook_cleanup_flags() {
	"${UTOUTLOOK_BIN}/rm" -f "${UTOUTLOOK_EXITCLIENT}" \
		"${UTOUTLOOK_KILLEDCLIENT}" \
		"${UTOUTLOOK_EXITCOMMAND}" 2>/dev/null || true
}

# ============================================================
# Full cleanup: kill app + remove locks + remove flags
# ============================================================
utoutlook_full_cleanup() {
	utoutlook_kill_app
	utoutlook_cleanup_locks
	utoutlook_cleanup_flags
}

# ============================================================
# Kill processes by scanning /proc for prospect-mail binary
# (fallback when pkill is not available or misses some)
# ============================================================
utoutlook_kill_by_proc() {
	local pids
	pids=$("${UTOUTLOOK_BIN}/ls" -l /proc/*/exe 2>/dev/null | \
		"${UTOUTLOOK_BIN}/grep" "prospect-mail" | \
		grep -v daemon | \
		"${UTOUTLOOK_BIN}/awk" -F'/' '{print $3}')
	for pid in $pids; do
		kill -9 "$pid" 2>/dev/null || true
	done
}

# ============================================================
# Notify via the embedded notify binary (UBports D-Bus)
# Usage: utoutlook_notify "Title" ["Body"]
# ============================================================
utoutlook_notify() {
	if [ -x "${UTOUTLOOK_BIN}/notify" ]; then
		"${UTOUTLOOK_BIN}/notify" "$@" 2>/dev/null || true
	fi
}
