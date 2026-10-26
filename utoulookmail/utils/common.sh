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
export UTOUTLOOK_LANG_FILE="${UTOUTLOOK_CONFIG_DIR}/lang"

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
# i18n — Read language from lang file (written by Electron)
# Falls back to LANG env var, then to 'fr'
# ============================================================
utoutlook_get_lang() {
	if [ -f "${UTOUTLOOK_LANG_FILE}" ]; then
		cat "${UTOUTLOOK_LANG_FILE}" 2>/dev/null | tr -d '[:space:]'
	else
		echo "${LANG:-fr}" | cut -d_ -f1 | cut -d. -f1
	fi
}

# ============================================================
# i18n — Translate a key for the current language
# Usage: utoutlook_t "shell.welcome"
# ============================================================
utoutlook_t() {
	local key="$1"
	local lang
	lang=$(utoutlook_get_lang)
	[ -z "${lang}" ] && lang="fr"

	case "${key}" in
		# --- Shell notifications ---
		"shell.welcome")
			case "${lang}" in
				en) echo "Welcome to UToutlook Mail" ;;
				es) echo "Bienvenido a UToutlook Mail" ;;
				de) echo "Willkommen bei UToutlook Mail" ;;
				it) echo "Benvenuto in UToutlook Mail" ;;
				pt) echo "Bem-vindo ao UToutlook Mail" ;;
				zh) echo "欢迎使用 UToutlook Mail" ;;
				ar) echo "مرحباً بك في UToutlook Mail" ;;
				*)  echo "Bienvenue dans UToutlook Mail" ;;
			esac ;;
		"shell.waitClose")
			case "${lang}" in
				en) echo "Please wait for UToutlook to close" ;;
				es) echo "Espera a que UToutlook se cierre" ;;
				de) echo "Bitte warte, bis UToutlook geschlossen wird" ;;
				it) echo "Attendi la chiusura di UToutlook" ;;
				pt) echo "Aguarde o fecho do UToutlook" ;;
				zh) echo "请等待 UToutlook 关闭" ;;
				ar) echo "الرجاء الانتظار حتى يغلق UToutlook" ;;
				*)  echo "Veuillez attendre la fermeture d'UToutlook" ;;
			esac ;;
		"shell.cleaning")
			case "${lang}" in
				en) echo "Cleaning UToutlook Mail" ;;
				es) echo "Limpiando UToutlook Mail" ;;
				de) echo "UToutlook Mail wird bereinigt" ;;
				it) echo "Pulizia di UToutlook Mail" ;;
				pt) echo "Limpando UToutlook Mail" ;;
				zh) echo "正在清理 UToutlook Mail" ;;
				ar) echo "جارٍ تنظيف UToutlook Mail" ;;
				*)  echo "Nettoyage d'UToutlook Mail" ;;
			esac ;;
		"shell.noNetwork")
			case "${lang}" in
				en) echo "No network access... quitting" ;;
				es) echo "Sin acceso a la red... cerrando" ;;
				de) echo "Kein Netzwerkzugriff... wird beendet" ;;
				it) echo "Nessun accesso di rete... chiusura" ;;
				pt) echo "Sem acesso à rede... a encerrar" ;;
				zh) echo "无网络访问...正在退出" ;;
				ar) echo "لا يوجد وصول للشبكة... جارٍ الخروج" ;;
				*)  echo "Pas d'accès réseau... fermeture" ;;
			esac ;;
		"shell.goodbye")
			case "${lang}" in
				en) echo "Goodbye UToutlook Mail!" ;;
				es) echo "¡Adiós UToutlook Mail!" ;;
				de) echo "Auf Wiedersehen UToutlook Mail!" ;;
				it) echo "Arrivederci UToutlook Mail!" ;;
				pt) echo "Adeus UToutlook Mail!" ;;
				zh) echo "再见 UToutlook Mail！" ;;
				ar) echo "وداعاً UToutlook Mail!" ;;
				*)  echo "Au revoir UToutlook Mail !" ;;
			esac ;;
		"shell.resetDone")
			case "${lang}" in
				en) echo "Reset done... launch UToutlook Mail" ;;
				es) echo "Restablecimiento hecho... inicia UToutlook Mail" ;;
				de) echo "Zurücksetzen erledigt... starte UToutlook Mail" ;;
				it) echo "Ripristino completato... avvia UToutlook Mail" ;;
				pt) echo "Redefinição concluída... inicie o UToutlook Mail" ;;
				zh) echo "重置完成...请启动 UToutlook Mail" ;;
				ar) echo "اكتمل إعادة التعيين... شغّل UToutlook Mail" ;;
				*)  echo "Réinitialisation effectuée... lancez UToutlook Mail" ;;
			esac ;;
		*) echo "${key}" ;;
	esac
}

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
# Strategy: SIGTERM first (allows Chromium to flush cookies/session
# to disk), wait up to 5 seconds, then SIGKILL as last resort.
# SIGKILL alone loses the most recent cookies → user sees login page.
# ============================================================
utoutlook_kill_app() {
	# Check if any prospect-mail process is running
	if ! "${UTOUTLOOK_BIN}/pkill" -0 prospect-mail 2>/dev/null; then
		# No process running, nothing to kill
		"${UTOUTLOOK_BIN}/pkill" -9 qmlscene 2>/dev/null || true
		return 0
	fi

	# Step 1: SIGTERM — graceful shutdown (flushes cookies, closes windows)
	"${UTOUTLOOK_BIN}/pkill" -TERM prospect-mail 2>/dev/null || true

	# Step 2: Wait up to 5 seconds for graceful exit
	local waited=0
	while [ $waited -lt 5 ]; do
		if ! "${UTOUTLOOK_BIN}/pkill" -0 prospect-mail 2>/dev/null; then
			# Process exited gracefully
			"${UTOUTLOOK_BIN}/pkill" -9 qmlscene 2>/dev/null || true
			return 0
		fi
		"${UTOUTLOOK_BIN}/sleep" 1
		waited=$((waited + 1))
	done

	# Step 3: SIGKILL — process refused to die
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
