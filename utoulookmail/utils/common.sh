#!/bin/bash
# ============================================================
# common.sh — Shared shell functions for Utoutlook Mail
# Source this file: source "${WD}/utils/common.sh"
# Requires: ${WD} to be set (app install directory)
# ============================================================

# --- Path constants ---
export UTOUTLOOK_CONFIG_DIR="${HOME}/.config/utoutlook.mathias"
export UTOUTLOOK_CACHE_DIR="${HOME}/.cache/utoutlook.mathias"
export UTOUTLOOK_DATA_DIR="${UTOUTLOOK_CONFIG_DIR}/data"
export UTOUTLOOK_PID_FILE="${UTOUTLOOK_DATA_DIR}/__prospect.pid"
export UTOUTLOOK_LANG_FILE="${UTOUTLOOK_CONFIG_DIR}/lang"

# Singleton lock files (Electron)
export UTOUTLOOK_LOCK="${UTOUTLOOK_CONFIG_DIR}/prospect-mail/SingletonLock"
export UTOUTLOOK_LOCKCOOK="${UTOUTLOOK_CONFIG_DIR}/prospect-mail/SingletonCookie"
export UTOUTLOOK_LOCKSOCK="${UTOUTLOOK_CONFIG_DIR}/prospect-mail/SingletonSocket"

# IPC flag files
export UTOUTLOOK_EXITCLIENT="${UTOUTLOOK_CONFIG_DIR}/exitclient"
# v4.0.91: flag écrit par l'app juste avant de quitter pour une rotation
export UTOUTLOOK_ROTATIONFLAG="${UTOUTLOOK_CONFIG_DIR}/rotation-relaunch"
export UTOUTLOOK_KILLEDCLIENT="${UTOUTLOOK_CONFIG_DIR}/killedmail"
export UTOUTLOOK_FILELIFE="${UTOUTLOOK_CONFIG_DIR}/follow"
export UTOUTLOOK_EXITCOMMAND="${UTOUTLOOK_CONFIG_DIR}/close"
# v4.0.37: set while the wrapper is shutting down (between SIGTERM and the
# goodbye notification). A fresh closing flag means "app is quitting, do not
# relaunch yet" — new launches are refused with a "please wait" message.
export UTOUTLOOK_CLOSING="${UTOUTLOOK_CONFIG_DIR}/closing"
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
		"shell.waitingClose")
			case "${lang}" in
				en) echo "Waiting for UToutlook to close…" ;;
				es) echo "Esperando a que UToutlook cierre…" ;;
				de) echo "Warte auf Schließen von UToutlook…" ;;
				it) echo "In attesa della chiusura di UToutlook…" ;;
				pt) echo "A aguardar o fecho do UToutlook…" ;;
				zh) echo "等待 UToutlook 关闭…" ;;
				ar) echo "في انتظار إغلاق UToutlook…" ;;
				*)  echo "En attente de fermeture d’UToutlook…" ;;
			esac ;;
		"shell.pleaseWait")
			case "${lang}" in
				en) echo "Please wait…" ;;
				es) echo "Espera un momento…" ;;
				de) echo "Bitte warten…" ;;
				it) echo "Attendere prego…" ;;
				pt) echo "Aguarde um momento…" ;;
				zh) echo "请稍候…" ;;
				ar) echo "الرجاء الانتظار…" ;;
				*)  echo "Merci de patienter…" ;;
			esac ;;
		"shell.pleaseRelaunch")
			case "${lang}" in
				en) echo "Please relaunch UToutlook Mail" ;;
				es) echo "Relanza UToutlook Mail" ;;
				de) echo "Bitte UToutlook Mail neu starten" ;;
				it) echo "Riavvia UToutlook Mail" ;;
				pt) echo "Reinicia o UToutlook Mail" ;;
				zh) echo "请重新启动 UToutlook Mail" ;;
				ar) echo "أعد تشغيل UToutlook Mail" ;;
				*)  echo "Merci de relancer UToutlook Mail" ;;
			esac ;;
		# v4.0.127: notifié quand le mode logiciel est activé automatiquement.
		"shell.softwareMode")
			case "${lang}" in
				en) echo "Software rendering enabled after a graphics crash" ;;
				es) echo "Renderizado por software activado tras un fallo gráfico" ;;
				de) echo "Software-Rendering nach einem Grafikfehler aktiviert" ;;
				it) echo "Rendering software attivato dopo un errore grafico" ;;
				pt) echo "Renderização por software ativada após falha gráfica" ;;
				zh) echo "图形崩溃后已启用软件渲染" ;;
				ar) echo "تم تفعيل العرض البرمجي بعد خطأ رسومي" ;;
				*)  echo "Rendu logiciel activé après un crash graphique" ;;
			esac ;;
		# v4.0.128: écran de secours affiché sur la splash après un crash GPU.
		"qml.renderRescueTitle")
			case "${lang}" in
				en) echo "UToutlook hit a graphics problem" ;;
				es) echo "UToutlook tuvo un problema gráfico" ;;
				de) echo "UToutlook hatte ein Grafikproblem" ;;
				it) echo "UToutlook ha riscontrato un problema grafico" ;;
				pt) echo "O UToutlook teve um problema gráfico" ;;
				zh) echo "UToutlook 遇到图形问题" ;;
				ar) echo "واجه UToutlook مشكلة رسومية" ;;
				*)  echo "UToutlook a rencontré un problème graphique" ;;
			esac ;;
		"qml.renderSoftware")
			case "${lang}" in
				en) echo "Use software rendering" ;;
				es) echo "Usar renderizado por software" ;;
				de) echo "Software-Rendering verwenden" ;;
				it) echo "Usa il rendering software" ;;
				pt) echo "Usar renderização por software" ;;
				zh) echo "使用软件渲染" ;;
				ar) echo "استخدم العرض البرمجي" ;;
				*)  echo "Utiliser le rendu logiciel" ;;
			esac ;;
		"qml.renderOpengl")
			case "${lang}" in
				en) echo "Use OpenGL rendering" ;;
				es) echo "Usar renderizado OpenGL" ;;
				de) echo "OpenGL-Rendering verwenden" ;;
				it) echo "Usa il rendering OpenGL" ;;
				pt) echo "Usar renderização OpenGL" ;;
				zh) echo "使用 OpenGL 渲染" ;;
				ar) echo "استخدم عرض OpenGL" ;;
				*)  echo "Utiliser le rendu OpenGL" ;;
			esac ;;
		# --- QML screens (v3.3.65: passed to qmlscene via /tmp JS file) ---
		"qml.noNetwork")
			case "${lang}" in
				en) echo "NO NETWORK !!" ;;
				es) echo "SIN RED !!" ;;
				de) echo "KEIN NETZWERK !!" ;;
				it) echo "NESSUNA RETE !!" ;;
				pt) echo "SEM REDE !!" ;;
				zh) echo "无网络 !!" ;;
				ar) echo "لا توجد شبكة !!" ;;
				*)  echo "PAS DE RÉSEAU !!" ;;
			esac ;;
		"qml.relaunch")
			case "${lang}" in
				en) echo "Relaunching (orientation change)…" ;;
				es) echo "Reiniciando (cambio de orientación)…" ;;
				de) echo "Neu starten (Orientierungswechsel)…" ;;
				it) echo "Riavvio (cambio di orientazione)…" ;;
				pt) echo "A reiniciar (mudança de orientação)…" ;;
				zh) echo "正在重启（方向改变）…" ;;
				ar) echo "جارٍ إعادة التشغيل (تغيير الاتجاه)…" ;;
				*)  echo "Relance en cours (changement d'orientation)…" ;;
			esac ;;
		"qml.exitTimeout")
			case "${lang}" in
				en) echo "Timeout speaking with outlook server. This is not really a problem — you can launch the client once more ;)" ;;
				es) echo "Tiempo de espera agotado con el servidor de outlook. No es un problema real — puedes iniciar el cliente otra vez ;)" ;;
				de) echo "Zeitüberschreitung bei der Verbindung zum Outlook-Server. Kein wirkliches Problem — du kannst den Client erneut starten ;)" ;;
				it) echo "Timeout nella comunicazione con il server outlook. Non è un vero problema — puoi riavviare il client ;)" ;;
				pt) echo "Tempo limite ao falar com o servidor do outlook. Não é um problema real — podes iniciar o cliente outra vez ;)" ;;
				zh) echo "连接 outlook 服务器超时。这其实不是问题 — 你可以再启动一次客户端 ;)" ;;
				ar) echo "انتهت مهلة الاتصال بخادم outlook. هذه ليست مشكلة حقيقية — يمكنك تشغيل العميل مرة أخرى ;)" ;;
				*)  echo "Délai dépassé avec le serveur outlook. Ce n'est pas vraiment un problème — vous pouvez relancer le client ;)" ;;
			esac ;;
		# v4.0.126: message d'étape affiché par la barre de démarrage QML lancée
		# dès la 1re ligne du wrapper. %N est remplacé par le numéro d'étape
		# dans utoutlook_set_start_step() (substitution bash, pas de sed —
		# AppArmor peut bloquer /usr/bin/sed sur le click installé).
		"qml.startStep")
			case "${lang}" in
				en) echo "Starting up — step %N of 5" ;;
				es) echo "Iniciando — paso %N de 5" ;;
				de) echo "Startvorgang — Schritt %N von 5" ;;
				it) echo "Avvio — passaggio %N di 5" ;;
				pt) echo "A iniciar — etapa %N de 5" ;;
				zh) echo "正在启动 — 第 %N 步，共 5 步" ;;
				ar) echo "جارٍ التشغيل — الخطوة %N من 5" ;;
				*)  echo "Démarrage — étape %N sur 5" ;;
			esac ;;
		*) echo "${key}" ;;
	esac
}

# Write a JS file with the translated QML strings, imported by the .qml screens.
# qmlscene cannot read env vars directly; /tmp is writable on the device.
# Usage: utoutlook_write_qml_i18n
utoutlook_write_qml_i18n() {
	local f="/tmp/utoutlook-qml-i18n.js"
	{
		echo "var NO_NETWORK = \"$(utoutlook_t 'qml.noNetwork' | sed 's/\\/\\\\/g; s/"/\\"/g')\";"
		echo "var EXIT_TIMEOUT = \"$(utoutlook_t 'qml.exitTimeout' | sed 's/\\/\\\\/g; s/"/\\"/g')\";"
		echo "var RELAUNCH = \"$(utoutlook_t 'qml.relaunch' | sed 's/\\/\\\\/g; s/"/\\"/g')\";"
		# v4.0.128: libellés de l'écran de secours rendu logiciel / OpenGL
		echo "var RENDER_TITLE = \"$(utoutlook_t 'qml.renderRescueTitle' | sed 's/\\/\\\\/g; s/"/\\"/g')\";"
		echo "var RENDER_SOFTWARE = \"$(utoutlook_t 'qml.renderSoftware' | sed 's/\\/\\\\/g; s/"/\\"/g')\";"
		echo "var RENDER_OPENGL = \"$(utoutlook_t 'qml.renderOpengl' | sed 's/\\/\\\\/g; s/"/\\"/g')\";"
	} > "${f}" 2>/dev/null || true
}

# ============================================================
# v4.1.0: barre de démarrage GÉNÉRÉE dans le dossier de l'app avec le
# libellé d'étape intégré. AppArmor interdit la lecture d'un .qml dans
# /tmp (v4.0.126 → splash bloquée) ; ~/.config/<app>/ est autorisé.
# Aucun texte en dur : tout passe par utoutlook_t(), substitution %N
# en bash pur (pas de sed sous AppArmor).
# ============================================================
export UTOUTLOOK_STEP_FILE="${UTOUTLOOK_CONFIG_DIR}/start-step"
export UTOUTLOOK_STARTUP_QML="${UTOUTLOOK_CONFIG_DIR}/startup.qml"

utoutlook_write_startup_qml() {
	local n="$1"
	local msg
	msg=$(utoutlook_t 'qml.startStep')
	msg="${msg//%N/${n}}"
	{
		printf 'import QtQuick 2.9\n'
		printf 'import QtQuick.Window 2.2\n'
		printf 'Window {\n    visible: true\n    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint\n    visibility: Window.FullScreen\n    color: "#0f0f1a"\n'
		printf '    Column {\n        anchors.centerIn: parent\n        spacing: 18\n'
		printf '        Rectangle {\n            width: 600; height: 8; radius: 4; color: "#2a2a3a"\n'
		printf '            Rectangle { id: bar; height: parent.height; width: 1; radius: parent.radius; color: "#E95420" }\n'
		printf '            NumberAnimation { target: bar; property: "width"; from: 1; to: 592; duration: 1100; loops: Animation.Infinite; running: true }\n'
		printf '        }\n'
		printf '        Text { anchors.horizontalCenter: parent.horizontalCenter; color: "#ffffff"; font.pixelSize: 22; text: "%s" }\n' "${msg}"
		printf '    }\n}\n'
	} > "${UTOUTLOOK_STARTUP_QML}" 2>/dev/null || true
}

utoutlook_set_start_step() {
	local n="$1"
	local msg
	msg=$(utoutlook_t 'qml.startStep')
	msg="${msg//%N/${n}}"
	printf '%s\n' "${msg}" > "${UTOUTLOOK_STEP_FILE}" 2>/dev/null || true
	utoutlook_write_startup_qml "${n}"
	echo "${msg}"
	# Relancer la barre pour afficher le nouveau libellé, sauf pendant le
	# tout premier lancement où start_startup_qml() s'en charge déjà.
	if [ "${UTOUTLOOK_STARTUP_LAUNCHING:-0}" != "1" ] && utoutlook_startup_qml_alive; then
		kill "${STARTUP_QML_PID}" 2>/dev/null || true
		wait "${STARTUP_QML_PID}" 2>/dev/null || true
		STARTUP_QML_PID=""
		qmlscene "${UTOUTLOOK_STARTUP_QML}" > "${UTOUTLOOK_CONFIG_DIR}/startup-qml.log" 2>&1 &
		STARTUP_QML_PID=$!
		echo "startup step ${n} shown (qml pid ${STARTUP_QML_PID})"
	fi
}

# v4.0.126: la barre lancée dès la 1re ligne du wrapper ne doit pas être tuée
# par les pkill qmlscene des nettoyages successifs (cleanup est appelé 3×).
utoutlook_startup_qml_alive() {
	[ -n "${STARTUP_QML_PID:-}" ] || return 1
	kill -0 "${STARTUP_QML_PID}" 2>/dev/null
}

utoutlook_kill_qmlscene() {
	if utoutlook_startup_qml_alive; then return 0; fi
	"${UTOUTLOOK_BIN}/pkill" -9 qmlscene 2>/dev/null || true
}

# v4.1.0: génère l'écran de secours DANS le dossier de l'app (autorisé
# AppArmor) avec les libellés traduits intégrés — aucun import depuis /tmp.
utoutlook_write_rescue_qml() {
	local dst="${UTOUTLOOK_CONFIG_DIR}/render-rescue.qml"
	local title soft opengl
	title=$(utoutlook_t 'qml.renderRescueTitle')
	soft=$(utoutlook_t 'qml.renderSoftware')
	opengl=$(utoutlook_t 'qml.renderOpengl')
	{
		printf 'import QtQuick 2.9\nimport QtQuick.Window 2.2\n'
		printf 'Window {\n    visible: true\n    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint\n    visibility: Window.FullScreen\n    color: "#0f0f1a"\n'
		printf '    Column {\n        anchors.centerIn: parent\n        spacing: 28\n'
		printf '        Text { anchors.horizontalCenter: parent.horizontalCenter; color: "#ffffff"; font.pixelSize: 26; text: "%s" }\n' "${title}"
		printf '        Rectangle { width: 560; height: 76; radius: 14; color: "#E95420"; anchors.horizontalCenter: parent.horizontalCenter\n'
		printf '          Text { anchors.centerIn: parent; color: "#ffffff"; font.pixelSize: 22; text: "%s" }\n' "${soft}"
		printf '          MouseArea { anchors.fill: parent; onClicked: { console.log("UT_RENDER_CHOICE=software"); Qt.exit(0); } }\n        }\n'
		printf '        Rectangle { width: 560; height: 76; radius: 14; color: "#2a2a3a"; border.color: "#E95420"; border.width: 2; anchors.horizontalCenter: parent.horizontalCenter\n'
		printf '          Text { anchors.centerIn: parent; color: "#ffffff"; font.pixelSize: 22; text: "%s" }\n' "${opengl}"
		printf '          MouseArea { anchors.fill: parent; onClicked: { console.log("UT_RENDER_CHOICE=opengl"); Qt.exit(0); } }\n        }\n'
		printf '    }\n}\n'
	} > "${dst}" 2>/dev/null || true
}

# ============================================================
# v4.0.127: mode de rendu — automatique avec override manuel.
#
# - ${UTOUTLOOK_RENDER_MODE_FILE} : "software" / "hardware" / "auto" (défaut).
#   Override utilisateur (fichier modifiable) pour forcer ou annuler le mode.
# - En "auto" : si wrapper.log contient une signature de crash GPU AJOUTÉE
#   depuis le dernier lancement, on bascule en rendu logiciel et on le
#   mémorise dans render-mode (persistant). Sinon on reste en matériel.
#
# Un utilisateur bloqué sur un écran transparent ne peut pas ouvrir un
# réglage dans l'app : la bascule doit donc être automatique, avec un
# override fichier pour revenir en arrière.
# ============================================================
export UTOUTLOOK_RENDER_MODE_FILE="${UTOUTLOOK_CONFIG_DIR}/render-mode"
export UTOUTLOOK_GPU_CRASH_MARKER="${UTOUTLOOK_CONFIG_DIR}/gpu-crash-line"

utoutlook_resolve_render_mode() {
	local mode=""
	if [ -f "${UTOUTLOOK_RENDER_MODE_FILE}" ]; then
		mode=$("${UTOUTLOOK_BIN}/cat" "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null | "${UTOUTLOOK_BIN}/tr" -d '[:space:]')
	fi
	case "${mode}" in
		software|on|1) echo "software"; return ;;
		hardware|off|0) echo "hardware"; return ;;
	esac

	# Seuls les binaires embarqués (grep/awk/cat/tr) — AppArmor.
	local last seen
	last=$("${UTOUTLOOK_BIN}/grep" -an -E "GPU process isn't usable|error_code=1002" \
		"${UTOUTLOOK_CONFIG_DIR}/wrapper.log" 2>/dev/null | \
		"${UTOUTLOOK_BIN}/awk" -F: 'END {print $1}')
	[ -n "${last}" ] || last=0
	if [ -f "${UTOUTLOOK_GPU_CRASH_MARKER}" ]; then
		seen=$("${UTOUTLOOK_BIN}/cat" "${UTOUTLOOK_GPU_CRASH_MARKER}" 2>/dev/null | \
			"${UTOUTLOOK_BIN}/tr" -d '[:space:]')
		[ -n "${seen}" ] || seen=0
	else
		# Premier lancement de cette version : consommer l'historique sans
		# basculer (les crashes des versions précédentes ne doivent pas
		# forcer le mode logiciel chez tout le monde).
		seen=${last}
	fi
	# Consommer les crashes déjà vus pour ne pas rebasculer à chaque lancement.
	printf '%s' "${last}" > "${UTOUTLOOK_GPU_CRASH_MARKER}" 2>/dev/null || true

	if [ "${last}" -gt "${seen}" ] 2>/dev/null; then
		printf 'software' > "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null || true
		echo "software"
	else
		echo "hardware"
	fi
}

# v4.0.128: vrai si un crash GPU a été AJOUTÉ depuis le dernier lancement.
# Appelé AVANT utoutlook_resolve_render_mode() (qui consomme le marqueur)
# pour décider d'afficher l'écran de secours QML.
utoutlook_gpu_crash_is_new() {
	local last seen
	last=$("${UTOUTLOOK_BIN}/grep" -an -E "GPU process isn't usable|error_code=1002" \
		"${UTOUTLOOK_CONFIG_DIR}/wrapper.log" 2>/dev/null | \
		"${UTOUTLOOK_BIN}/awk" -F: 'END {print $1}')
	[ -n "${last}" ] || return 1
	if [ -f "${UTOUTLOOK_GPU_CRASH_MARKER}" ]; then
		seen=$("${UTOUTLOOK_BIN}/cat" "${UTOUTLOOK_GPU_CRASH_MARKER}" 2>/dev/null | \
			"${UTOUTLOOK_BIN}/tr" -d '[:space:]')
		[ -n "${seen}" ] || seen=0
	else
		seen=${last}
	fi
	[ "${last}" -gt "${seen}" ] 2>/dev/null
}

# ============================================================
# Ping the Electron app via Unix socket (returns 0 if alive and answering)
# Usage: utoutlook_socket_ping
# ============================================================
utoutlook_socket_ping() {
	python3 -c "
import socket, sys
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(2)
    s.connect('${UTOUTLOOK_SOCKET}')
    s.sendall(b'{\"cmd\":\"ping\"}\n')
    data = s.recv(1024)
    s.close()
    sys.exit(0 if b'pong' in data else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null
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
	# v3.3.30: check FIRST whether a prospect-mail is running. When none is
	# (normal launch), skip the close flag + 3s sleep entirely — cleanup()
	# calls this 3x per wrapper start, so the unconditional sleep cost 9s on
	# EVERY launch ("startup is very long").
	if ! "${UTOUTLOOK_BIN}/pkill" -0 prospect-mail 2>/dev/null; then
		# No process running, nothing to kill
		# v4.0.126: garder notre barre de démarrage si elle est déjà affichée
		utoutlook_kill_qmlscene
		return 0
	fi

	# v3.3.10: poser un flag close FRAIS avant tout kill. L'ancien process
	# (booté avant nous) le verra dans son heartbeat (toutes les 2s) et fera un
	# arrêt gracieux avec flush des cookies. Indispensable à l'upgrade:
	# AppArmor bloque les signaux cross-label (3.3.8→3.3.9), donc pkill depuis
	# le nouveau wrapper ne peut pas tuer l'ancien process/service — le flag
	# fichier, lui, passe. Le nouveau process Electron supprime ce flag au boot
	# et ignore ceux écrits avant son démarrage (mtime guard, v3.3.5).
	# v4.0.14: embed wrapper PID (if known) so the app only honors OUR close flag
	echo "closed:${UTOUTLOOK_WRAPPER_PID:-unknown}" > "${UTOUTLOOK_EXITCOMMAND}" 2>/dev/null || true
	# ~3s pour laisser l'ancien process sortir proprement
	"${UTOUTLOOK_BIN}/sleep" 3 2>/dev/null || /bin/sleep 3 2>/dev/null || true

	# Step 1: SIGTERM — graceful shutdown (flushes cookies, closes windows)
	"${UTOUTLOOK_BIN}/pkill" -TERM prospect-mail 2>/dev/null || true

	# Step 2: Wait up to 5 seconds for graceful exit
	local waited=0
	while [ $waited -lt 5 ]; do
		if ! "${UTOUTLOOK_BIN}/pkill" -0 prospect-mail 2>/dev/null; then
			# Process exited gracefully
			utoutlook_kill_qmlscene # v4.0.126: ne pas tuer notre barre
			return 0
		fi
		"${UTOUTLOOK_BIN}/sleep" 1
		waited=$((waited + 1))
	done

	# Step 3: SIGKILL — process refused to die
	"${UTOUTLOOK_BIN}/pkill" -9 prospect-mail 2>/dev/null || true
	utoutlook_kill_qmlscene # v4.0.126: ne pas tuer notre barre
}

# ============================================================
# Remove Electron singleton lock files
# ============================================================
utoutlook_cleanup_locks() {
	"${UTOUTLOOK_BIN}/rm" -f "${UTOUTLOOK_LOCK}" "${UTOUTLOOK_LOCKCOOK}" "${UTOUTLOOK_LOCKSOCK}" 2>/dev/null || true
}

# ============================================================
# Kill orphaned command.sh wrappers from older versions (v3.3.5).
# During a click upgrade, `kill: prospect-mail` stops the Electron process
# but NOT the old shell wrapper, which keeps looping and can write
# "tried too more" into the close flag while the NEW process is starting —
# the new process then exits 2s after launch (intermittent startup crash).
# The current wrapper ($$) and its parent are never killed.
# ============================================================
utoutlook_kill_stale_wrappers() {
	local self=$$ parent=$PPID p pidfile="${UTOUTLOOK_DATA_DIR}/wrapper.pid"
	# v3.3.30: SIGKILL directly, never SIGTERM — a TERM'd wrapper runs its EXIT
	# trap (close_command) which writes the close flag / sends the socket quit;
	# those reach the NEW instance (same paths) and kill it right after its
	# first launch. SIGKILL = no trap = no flag. The old app process itself is
	# handled separately by utoutlook_kill_app (flag + TERM + wait + KILL).
	#
	# Primary mechanism: pidfile (works under AppArmor — no /proc cmdline scan).
	# NOTE: cleanup() now writes OUR pid to the pidfile BEFORE calling this,
	# so the pidfile branch below no longer fires for the previous wrapper —
	# the previous wrapper self-exits via the pidfile check in
	# verify_prospect_life, and the pgrep fallback SIGKILLs it here.
	# v4.0.94: no noisy logging when there is nothing to kill — the old
	# "killing stale wrapper"/"pgrep fallback found" lines printed at EVERY
	# launch (stale pidfile from a dead previous run) made it look like
	# zombies were being killed on a fresh start. Also: verify via /proc cmdline
	# that the pid really is a command.sh wrapper before SIGKILL — a recycled
	# pid (pid reuse) could otherwise kill an innocent process.
	utoutlook_pid_is_wrapper() {
		local pid="$1"
		[ -n "$pid" ] || return 1
		kill -0 "$pid" 2>/dev/null || return 1
		"${UTOUTLOOK_BIN}/grep" -q 'command\.sh' "/proc/${pid}/cmdline" 2>/dev/null
	}
	if [ -f "$pidfile" ]; then
		p=$("${UTOUTLOOK_BIN}/cat" "$pidfile" 2>/dev/null | "${UTOUTLOOK_BIN}/tr" -d '[:space:]')
		if [ -n "$p" ] && [ "$p" != "$self" ] && [ "$p" != "$parent" ] && utoutlook_pid_is_wrapper "$p"; then
			echo "killing stale wrapper pid=$p (from pidfile)"
			kill -9 "$p" 2>/dev/null || true
		fi
	fi
	# Fallback: pgrep scan (may be restricted by AppArmor — silent unless it
	# actually kills something).
	local found
	found=$("${UTOUTLOOK_BIN}/pgrep" -f '^/bin/bash .*bin/command\.sh' 2>/dev/null)
	for p in $found; do
		[ "$p" = "$self" ] && continue
		[ "$p" = "$parent" ] && continue
		if utoutlook_pid_is_wrapper "$p"; then
			echo "killing stale wrapper pid=$p (pgrep)"
			kill -9 "$p" 2>/dev/null || true
		fi
	done
}

# ============================================================
# Freshness check for lifecycle flag files.
# Usage: utoutlook_flag_fresh <flagfile>
# Returns 0 only if the flag EXISTS and was written AFTER the current
# wrapper started (marker file UTOUTLOOK_WRAPPER_MARKER, created by
# command.sh at init). Uses the bash builtin [ -nt ] (stat syscall) —
# no external binary, safe under AppArmor confinement.
#
# Why (v4.0.10, fix upgrade from < 3.0): v2.x wrote `exitclient` routinely
# (its heartbeat wrote it whenever no window was visible for >10s, and
# hideOnClose=true was the v2 default → a swipe-close left the flag on
# disk). A stale flag made the new wrapper `exit 0` or relaunch the app
# through a close flag, killing the fresh instance right after launch
# → user stuck on the splash screen. Same guard as the close-flag mtime
# check on the Electron side (v3.3.5).
# ============================================================
utoutlook_flag_fresh() {
	local f="$1"
	[ -f "$f" ] || return 1
	if [ -n "${UTOUTLOOK_WRAPPER_MARKER}" ] && [ -f "${UTOUTLOOK_WRAPPER_MARKER}" ]; then
		[ "$f" -nt "${UTOUTLOOK_WRAPPER_MARKER}" ]
	else
		# No marker (could not be created) — keep the historical behavior
		return 0
	fi
}

# ============================================================
# v4.0.13: exitclient flag written by OUR client process?
# The flag now contains "quitclient:<pid>" — compare with CLIENT_PID.
# A flag written by a dying OLDER process (survives a click upgrade) has
# a different PID and must NOT make this wrapper exit.
# Usage: utoutlook_exitclient_ours <flagfile>
# ============================================================
utoutlook_exitclient_ours() {
	local f="$1"
	[ -f "$f" ] || return 1
	# v4.0.17: compare against the WRAPPER pid ($$, stable) — the flag now
	# contains quitclient:<wrapper_pid>, not the client pid (which changes on
	# every relaunch and broke the comparison after a swipe-close + relaunch).
	local content
	content=$("${UTOUTLOOK_BIN}/cat" "$f" 2>/dev/null | "${UTOUTLOOK_BIN}/tr" -d '[:space:]')
	[ "$content" = "quitclient:$$" ]
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
	utoutlook_kill_stale_wrappers
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
#
# Retry logic: the Lomiri Postal D-Bus service may not be ready
# immediately at startup. We retry up to 3 times with 2s delay.
# The notify binary now returns non-zero on failure (v3.2.2).
# ============================================================
utoutlook_notify() {
	if [ ! -x "${UTOUTLOOK_BIN}/notify" ]; then
		return 1
	fi

	local max_attempts=3
	local attempt=1
	while [ $attempt -le $max_attempts ]; do
		if "${UTOUTLOOK_BIN}/notify" "$@" 2>/dev/null; then
			return 0
		fi
		attempt=$((attempt + 1))
		if [ $attempt -le $max_attempts ]; then
			"${UTOUTLOOK_BIN}/sleep" 2
		fi
	done
	return 1
}

# ============================================================
# Wait for the notification service (Lomiri Postal) to be ready.
# Uses "notify --badge 0" as a silent probe — it exercises the
# D-Bus connection without showing any visible notification
# (badge 0 is invisible). Retries until it succeeds or the max
# wait time is reached.
# Usage: utoutlook_wait_notifications [max_wait_seconds]
# ============================================================
utoutlook_wait_notifications() {
	local max_wait="${1:-15}"
	local waited=0

	while [ $waited -lt $max_wait ]; do
		# Silent probe: set badge to 0 — no popup, no drawer entry
		if "${UTOUTLOOK_BIN}/notify" --badge 0 2>/dev/null; then
			return 0
		fi
		"${UTOUTLOOK_BIN}/sleep" 1
		waited=$((waited + 1))
	done
	return 1
}
