#!/bin/bash

trap close_command EXIT

function sleep_int() {
	# Fallback si le binaire embarqué est absent (ex: pendant une mise à jour,
	# un ancien wrapper pointe encore vers l'ancien dossier de version).
	if [ -x "${WD}"/bin/sleep ]; then
		"${WD}"/bin/sleep "$1"
	else
		/bin/sleep "$1" 2>/dev/null || true
	fi
}

function cleanup() {

	# v3.3.30: record OUR pid FIRST, before killing the previous wrapper —
	# so that when the stale wrapper's EXIT trap (close_command) runs, it sees
	# pidfile != $$ and exits SILENTLY. Otherwise it writes the close flag /
	# sends the socket quit, which can kill the NEW instance right after its
	# first launch ("app exits immediately on first start, then relaunches").
	mkdir -p "${UTOUTLOOK_DATA_DIR}" 2>/dev/null || true
	echo $$ > "${UTOUTLOOK_DATA_DIR}/wrapper.pid" 2>/dev/null || true
	# v4.0.11: our client is being killed — reset PID so the exitclient guard
	# does not mistake a flag written by the dying process for a clean quit.
	CLIENT_PID=0
	utoutlook_kill_app
	utoutlook_kill_stale_wrappers
	utoutlook_cleanup_locks
	"${WD}"/bin/rm -f "${UTOUTLOOK_EXITCOMMAND}" 2>/dev/null || true
	# v3.3.28: clear lifecycle flags AFTER killing the old app (kill_app waits
	# for its graceful exit, so a flag it wrote synchronously is already on
	# disk) — a stale exitclient must not make a later crash look like a
	# clean quit. Never clear them while the client is alive: the 'close'
	# event writes exitclient right before the process dies.
	"${WD}"/bin/rm -f "${UTOUTLOOK_EXITCLIENT}" "${UTOUTLOOK_KILLEDCLIENT}" 2>/dev/null || true
	# v4.0.10: refresh the freshness marker AFTER the old process is dead and
	# the flags are removed — anything written from now on belongs to the new
	# generation; anything older (e.g. a flag the dying pre-3.0 process wrote
	# during its shutdown) is stale and ignored by utoutlook_flag_fresh().
	if [ -n "${UTOUTLOOK_WRAPPER_MARKER}" ]; then
		: > "${UTOUTLOOK_WRAPPER_MARKER}" 2>/dev/null || true
	fi
}

function launch_prospect() {
	cleanup
	if [[ -f ${lock} ]]; then
		utoutlook_notify "$(utoutlook_t 'shell.waitClose')"
	fi
	launchtry=$((launchtry + 1))
	if [ "$launchtry" -gt 3 ]; then
		cleanup
		echo "tried too more " >${exitcommand}
		utoutlook_write_qml_i18n
		qmlscene "${WD}"/qml/nonetwork.qml
		exit 0
	fi
	export APPDIR=${WD}/bin/App/
	# Wait for notification service to be ready before sending welcome
	# (D-Bus Postal may not be up yet on first launch / boot)
	utoutlook_wait_notifications 15
	utoutlook_notify "$(utoutlook_t 'shell.welcome')"

	# v3.3.45: native Wayland client (Lomiri session) — Maliit OSK goes through
	# the Wayland text-input protocol, password fields included (as in 3.2.x).
	"${WD}"/bin/App/prospect-mail "$dpioptions" "$sandboxoptions" "$gpuoptions" &
	# v4.0.11: capture client PID — kill -0 (builtin, AppArmor-safe) tells us
	# whether OUR client is alive; used to ignore exitclient flags written by
	# a dying older process during upgrade.
	CLIENT_PID=$!
	i+=1
}

function verify_prospect_life() {

	# v3.3.10: si un wrapper plus récent a pris la main (pidfile != $$), on sort
	# proprement — sinon deux wrappers de versions différentes se relancent
	# l'app l'un contre l'autre en boucle (vu à l'upgrade 3.3.9→3.3.10).
	local curpid
	curpid=$("${WD}"/bin/cat "${UTOUTLOOK_DATA_DIR}/wrapper.pid" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
	if [ -n "${curpid}" ] && [ "${curpid}" != "$$" ]; then
		echo "another wrapper (pid ${curpid}) owns the app — exiting"
		exit 0
	fi

	# Lecture sûre du heartbeat (le fichier peut ne pas exister encore)
	local follow=""
	if [ -f "${filelifefollow}" ]; then
		follow=$("${WD}"/bin/cat "${filelifefollow}" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
	fi

	echo "FOLLOW"
	echo ${follow}
	echo ${oldfollow}

	# Heartbeat absent/vide : Electron n'a pas encore écrit son premier
	# heartbeat (cold start lent). Fenêtre de grâce de 20 lectures x 3s = 60s
	# avant de conclure à un échec de démarrage — sinon une valeur stale du
	# lancement précédent provoquait une fausse "stagnation" et quittait
	# l'app une fois sur 2-3 au démarrage.
	if [ -z "${follow}" ]; then
		startupGrace=$((startupGrace + 1))
		if [ ${startupGrace} -lt 20 ]; then
			echo "heartbeat not started yet (grace ${startupGrace}/20)"
			return
		fi
		# v3.3.9: au lieu de quitter, on nettoie et on RELANCE (launch_prospect
		# a sa propre limite launchtry>3 → exit). Ne PAS écrire exitcommand ici :
		# le close flag resterait et le process relancé le lirait (même si le
		# mtime guard le protège, autant ne pas le poser).
		echo "heartbeat never started — cleaning and relaunching (try ${launchtry})"
		echo "******" && utoutlook_notify "$(utoutlook_t 'shell.cleaning')"
		# v4.0.36: watchdog — on retry (launchtry>1) with no heartbeat, the splash
		# is likely stuck: tell the user to relaunch manually.
		if [ "${launchtry}" -gt 1 ]; then
			utoutlook_notify "$(utoutlook_t 'shell.pleaseRelaunch')"
		fi
		stagnantCount=0
		startupGrace=0
		oldfollow=""
		launch_prospect
		return
	fi

	clientalive=0
	if [ -n "${oldfollow}" ] && [ "${follow}" = "${oldfollow}" ]; then
		# v3.3.5: exige 2 stagnations consécutives avant de conclure — une
		# seule lecture identique peut être un artefact (lecture pendant
		# l'écriture du heartbeat, wrapper orphelin, etc.).
		stagnantCount=$((stagnantCount + 1))
		echo "heartbeat stagnant (${stagnantCount}/2)"
		if [ ${stagnantCount} -ge 2 ]; then
			# v3.3.28: heartbeat stopped — but if the app wrote its clean-quit
			# flag (window closed by swipe / SIGTERM; written synchronously
			# before exit), this is a DELIBERATE quit: exit the wrapper
			# instead of relaunching the app the user just closed.
			# v4.0.10: only honor the flag if FRESH (written after this wrapper
			# started) — v2.x left stale exitclient flags on disk and the old v2
			# process (survives a click upgrade, AppArmor blocks cross-label
			# pkill) can rewrite one while shutting down; a stale flag made the
			# wrapper exit or relaunch-kill the fresh instance (splash stuck).
			# v4.0.13: only honor exitclient if it was written by OUR client
			# process (flag content = "quitclient:$CLIENT_PID") — a dying old
			# process can write the flag after cleanup refreshed the marker.
			if utoutlook_flag_fresh "${exitclient}" && utoutlook_exitclient_ours "${exitclient}"; then
				echo "exitclient flag present (ours, fresh) — app quit cleanly, wrapper exits"
				exit 0
			fi
			echo ${follow}
			echo ${oldfollow}
			# v3.3.9: nettoyer puis RELANCER au lieu de quitter (limite launchtry>3).
			echo "heartbeat dead — cleaning and relaunching (try ${launchtry})"
			echo "******" && utoutlook_notify "$(utoutlook_t 'shell.cleaning')"
			stagnantCount=0
			oldfollow=""
			launch_prospect
			return
		fi
	else
		stagnantCount=0
		# v3.3.9: client vivant → on remet le compteur de tentatives à zéro,
		# pour que une mort ultérieure ait droit à ses 3 essais.
		# v3.3.28: ne PAS toucher à ${exitclient} ici — le flag peut avoir été
		# écrit par le 'close' de la fenêtre juste avant la mort du process,
		# et un heartbeat peut passer entre les deux.
		launchtry=1
		clientalive=1
		touch ${lock}
	fi
	oldfollow=${follow}
	if [ ${clientalive} -eq 1 ]; then
		echo "client is alive"
	else

		# v4.0.10: freshness guards on both flags — a stale killedmail left by a
		# pre-3.0 version must not trigger a relaunch (which kills the fresh
		# instance via the close flag), and a stale exitclient must not make the
		# wrapper exit while the app is actually starting.
		if utoutlook_flag_fresh "${killedclient}" && ! utoutlook_flag_fresh "${exitclient}"; then
			sleep_int 1
			launch_prospect
		fi
		# v4.0.13: same — only exit on a fresh exitclient written by OUR client.
		if utoutlook_flag_fresh "${exitclient}" && utoutlook_exitclient_ours "${exitclient}"; then
			exit 0
		fi
	fi
	echo "done"
}

function test_net() {
	# Non bloquant : au réveil du téléphone, le réseau (DNS / 4G) peut mettre
	# plusieurs secondes à monter. 3 sondes de 2s max ; si tout échoue, on
	# lance quand même l'app — l'overlay "hors ligne" + le moniteur de
	# connectivité d'Electron gèrent la reconnexion automatique.
	local hosts=("google.com" "1.1.1.1" "outlook.office.com")
	local h
	for h in "${hosts[@]}"; do
		if "${WD}"/bin/nc -zw2 "$h" 443; then
			echo "we have connectivity ($h)"
			return 0
		fi
	done
	echo "no connectivity yet — launching anyway (offline overlay handles reconnect)"
	return 0
}
function close_command() {
	# v3.3.30: a STALE wrapper (killed by a newer one — pidfile != $$) must
	# exit silently. Writing the close flag or sending the socket quit here
	# would reach the NEW instance (same socket path / flag path) and kill it
	# right after its first launch.
	local curpid
	curpid=$("${WD}"/bin/cat "${UTOUTLOOK_DATA_DIR}/wrapper.pid" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
	if [ -n "${curpid}" ] && [ "${curpid}" != "$$" ]; then
		exit 0
	fi
	# v4.0.37: mark "closing" immediately — any relaunch while we are shutting
	# down is refused with a "please wait" message (the bug happened when the
	# user tapped the icon before the goodbye notification was sent).
	echo "closing" > "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
	# Send quit command via Unix socket (primary method)
	utoutlook_send_socket_cmd '{"cmd":"quit"}'
	# Fallback: write close flag file (picked up by heartbeat)
	# v4.0.14: embed wrapper PID so the app only honors OUR close flag
	echo "closed:${UTOUTLOOK_WRAPPER_PID}" >"${UTOUTLOOK_EXITCOMMAND}"
	utoutlook_notify "$(utoutlook_t 'shell.goodbye')"
	# v4.0.37: closing is done — remove the flag so the next launch is accepted
	"${WD}"/bin/rm -f "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
	exit 0
}

export WD=$(pwd)
echo "$WD"

# Source shared functions and path constants
source "${WD}/utils/common.sh"

# v4.0.15: log persistant du wrapper (Lomiri lance sans stdout visible) —
# indispensable pour diagnostiquer les quits intempestifs au 2e lancement.
# ATTENTION: uniquement des builtins shell (echo/printf/exec >>) — les binaires
# externes (date, tee, process substitution /dev/fd) sont bloqués par AppArmor.
_WRAPPER_LOG="${UTOUTLOOK_CONFIG_DIR}/wrapper.log"
mkdir -p "${UTOUTLOOK_CONFIG_DIR}" 2>/dev/null || true
printf '=== wrapper start pid=%s sec=%s ===\n' "$$" "${EPOCHSECONDS:-0}" >> "$_WRAPPER_LOG"
exec >> "$_WRAPPER_LOG" 2>&1

# D-Bus session bus — required by the notify binary (QDBusConnection::sessionBus).
# Lomiri normally sets these, but be defensive: if they are missing, the notify
# binary silently fails and welcome notifications never appear.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

# Alias legacy variable names to common.sh constants (avoids changing every reference)
export lock="${UTOUTLOOK_LOCK}"
export lockcook="${UTOUTLOOK_LOCKCOOK}"
export locksock="${UTOUTLOOK_LOCKSOCK}"
export exitclient="${UTOUTLOOK_EXITCLIENT}"
export killedclient="${UTOUTLOOK_KILLEDCLIENT}"
export filelifefollow="${UTOUTLOOK_FILELIFE}"
export exitcommand="${UTOUTLOOK_EXITCOMMAND}"
export socketpath="${UTOUTLOOK_SOCKET}"
# v4.0.14: PID of THIS wrapper, passed to prospect-mail via env so the app can
# tell a close flag written by ITS wrapper apart from one written by a dying
# older wrapper (race: old wrapper writes "closed" after the new one cleaned up).
export UTOUTLOOK_WRAPPER_PID=$$

###init
declare -i i=0
test_net
export launchtry=1

oldfollow="0"
startupGrace=0
stagnantCount=0
# v4.0.11: PID of the prospect-mail process launched by THIS wrapper (0 = none)
CLIENT_PID=0
# v4.0.10: freshness marker for lifecycle flags (exitclient/killedmail) —
# created ONCE here; utoutlook_flag_fresh() only honors flags written after
# this moment, so stale flags persisted by a pre-3.0 version (or rewritten
# by a surviving old process during the upgrade) are ignored.
export UTOUTLOOK_WRAPPER_MARKER="${UTOUTLOOK_CONFIG_DIR}/.wrapper-start"
: > "${UTOUTLOOK_WRAPPER_MARKER}" 2>/dev/null || true
"${WD}"/bin/rm -f ${exitclient}
"${WD}"/bin/rm -f ${killedclient}
"${WD}"/bin/rm -f /home/phablet/.config/utoutlook.mathias/close
# Supprime le heartbeat de la session précédente : tant qu'Electron n'a pas
# réécrit son premier compteur, verify_prospect_life verra un fichier absent
# (fenêtre de grâce) au lieu d'une valeur stale (fausse stagnation).
"${WD}"/bin/rm -f ${filelifefollow}
# v4.0.21: aggressive startup reset — after a swipe-close, old processes can
# survive (AppArmor blocks cross-label kill) and old wrappers can rewrite flags
# while dying, which made the NEXT launch slow-then-exit. Kill everything that
# looks like a previous utoutlook instance, wait for them to die, then clear
# every lifecycle flag so this launch starts from a clean slate.
"${WD}"/bin/pkill -9 -f "bin/App/prospect-mail" 2>/dev/null || true
# v4.0.34: ask any surviving old app (cross-label, pkill is blocked by
# AppArmor) to quit cleanly via the shared Unix socket — same socket path for
# all versions, so the quit command reaches even an old-version process.
utoutlook_send_socket_cmd '{"cmd":"quit"}'
# v4.0.30: kill stale wrappers too (except ourselves) so they release the flock
for _p in $("${UTOUTLOOK_BIN}/pgrep" -f "bin/command.sh" 2>/dev/null); do
	[ "${_p}" != "$$" ] && kill -9 "${_p}" 2>/dev/null || true
done
# v4.0.25: wait actively (max ~10s) for ALL old prospect-mail processes to die
# before launching — Lomiri SIGTERMs the process on swipe-close and a dying old
# process can rewrite lifecycle flags while the new one starts (race → "slow
# splash then exit" on relaunch). Retry loop instead of a fixed sleep.
_i=0
while [ ${_i} -lt 10 ]; do
	if "${UTOUTLOOK_BIN}/pgrep" -f "bin/App/prospect-mail" > /dev/null 2>&1; then
		# v4.0.25: notify the user once while we wait for the old process to die
		if [ ${_i} -eq 0 ]; then
			utoutlook_notify "$(utoutlook_t 'shell.waitingClose')"
		fi
		sleep_int 1
		_i=$((_i + 1))
	else
		break
	fi
done
"${WD}"/bin/rm -f ${exitclient} ${killedclient} "${UTOUTLOOK_EXITCOMMAND}" "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
cleanup
"${WD}"/utils/mkdir
"${WD}"/bin/rm -f "/home/phablet/.cache/utoutlook.mathias/quit"
"${WD}"/bin/rm -f "/home/phablet/.config/utoutlook.mathias/close"

# v4.0.35: if another instance answers the socket, ask it to show the app —
# but re-check after a short delay: if it died in between (SIGTERM from a
# swipe-close racing us), fall through and start normally instead of exiting
# into a void (intermittent "nothing happens" on relaunch).
if utoutlook_socket_ping; then
	echo "app already running — asking it to show (pid $$)"
	utoutlook_send_socket_cmd '{"cmd":"show"}'
	sleep_int 2
	if utoutlook_socket_ping; then
		exit 0
	fi
	echo "previous instance died after show — starting fresh (pid $$)"
fi
# v4.0.37: refuse to launch while a previous instance is still closing (flag
# set between SIGTERM and the goodbye notification, removed after). Wait up to
# 15s for the flag to disappear; if it never does (ghost), remove it and launch.
# No date/stat — only test -f and shell builtins (AppArmor-safe).
if [ -f "${UTOUTLOOK_CLOSING}" ]; then
	utoutlook_notify "$(utoutlook_t 'shell.pleaseWait')"
	echo "app is closing — waiting for goodbye before launching (pid $$)"
	_i=0
	while [ ${_i} -lt 5 ] && [ -f "${UTOUTLOOK_CLOSING}" ]; do
		sleep_int 3
		_i=$((_i + 1))
	done
	if [ -f "${UTOUTLOOK_CLOSING}" ]; then
		echo "closing flag stuck >15s (ghost) — removing and launching (pid $$)"
		"${WD}"/bin/rm -f "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
	else
		echo "closing finished — launching (pid $$)"
	fi
fi
echo "################################################"
export GDK_SCALE=2
export GTK_IM_MODULE=Maliit
export GTK_IM_MODULE_FILE=/home/phablet/.config/utoutlook.mathias/immodules.cache
# v3.3.27: XMODIFIERS is what makes the Maliit virtual keyboard deliver keys to
# X11/Chromium apps — without it the on-screen keyboard types nothing (GTK_IM_MODULE
# alone only covers GTK apps).
export XMODIFIERS=@im=maliit
export QT_IM_MODULE=maliit
# v3.3.45: keep the native Wayland session (do NOT unset WAYLAND_DISPLAY) —
# Chromium then talks to Maliit through the Wayland text-input protocol.
# XMODIFIERS/QT_IM_MODULE are kept for the X11/XWayland fallback path.
export DCONF_PROFILE=/nonexistent
export XDG_CONFIG_HOME=/home/phablet/.config/utoutlook.mathias/
export XDG_DATA_HOME=/home/phablet/.config/utoutlook.mathias/
export XDG_DESKTOP_DIR=/home/phablet/.config/utoutlook.mathias/
export LD_LIBRARY_PATH=$PWD/lib/aarch64-linux-gnu/

echo "\"$PWD/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/im-maliit.so\"" >/home/phablet/.config/utoutlook.mathias/immodules.cache
echo "\"Maliit\" \"Maliit Input Method\" \"maliit\" \"\" \"en:ja:ko:zh:*\"" >>/home/phablet/.config/utoutlook.mathias/immodules.cache
echo 'XDG_DESKTOP_DIR="/home/phablet/.cache/utoutlook.mathias/downloads/"' >/home/phablet/.config/utoutlook.mathias/user-dirs.dirs

echo "Going to launch"
echo "GRID UNIT PX""$GRID_UNIT_PX"
export QT_FILE_SELECTORS=ubuntu-touch

## cleanup
cleanup
numberold="0"
if [ -f "${filelifefollow}" ]; then
	numberold=$("${WD}"/bin/cat "${filelifefollow}" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
fi

echo "------------------------------------------------------------------"
echo $$ >>/home/phablet/.config/utoutlook.mathias/data/__prospect.pid

export PATH=$WD/bin:$PATH
echo "$PATH"
if [ "$DISPLAY" = "" ]; then
	i=0
	while [ -e "/tmp/.X11-unix/X$i" ]; do
		i=$((i + 1))
	done
	i=$((i - 1))
	display=":$i"
	export DISPLAY=$display
fi
echo "--------------------------------------------------------"
echo "--------------------------------------------------------"

echo "$DISPLAY"
"${WD}"/utils/verify_flag.sh
echo "---------------------------------------------------------"
echo "---------------------------------------------------------"

if [ "$textFontSize" = "" ]; then
	textFontSize=120
fi

if [ "$spanFontSize" = "" ]; then
	spanFontSize=100
fi
appScaling=$("${WD}"/utils/get-scale.sh 2>/dev/null)

scaling="$((appScaling / 115)).$(printf '%02d' "$((appScaling % 115))")"

dpioptions="--high-dpi-support=1 --force-device-scale-factor=$scaling  --text-font-size=$textFontSize --span-font-size=$spanFontSize"
sandboxoptions="--no-sandbox"
# v3.3.8: --in-process-gpu instead of --disable-gpu --disable-software-rasterizer.
# On the phone there is no reliable hardware GPU and libvk_swiftshader.so was
# removed from the package: with --disable-software-rasterizer there was NO
# fallback, and when Chromium still tried to spawn its separate GPU process and
# failed 3x (error_code=1002, intermittent — memory/timing), it hit
# FATAL "GPU process isn't usable. Goodbye." and killed the whole app
# (the intermittent startup crash). In-process GPU never spawns a separate
# process, so that FATAL can no longer happen; software raster stays enabled.
gpuoptions="--in-process-gpu --disable-features=VaapiVideoDecoder,AcceleratedVideoDecoder"

echo "launch utoutlookmail"

echo "----------------------------------------------------------------------"

echo "----------------------------------------------------------------------"
launch_prospect
sleep_int 15
while true; do
	sleep_int 3

	verify_prospect_life

done
