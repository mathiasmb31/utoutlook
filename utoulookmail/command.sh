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
		qmlscene "${WD}"/qml/nonetwork.qml
		exit 0
	fi
	export APPDIR=${WD}/bin/App/
	# Wait for notification service to be ready before sending welcome
	# (D-Bus Postal may not be up yet on first launch / boot)
	utoutlook_wait_notifications 15
	utoutlook_notify "$(utoutlook_t 'shell.welcome')"

	"${WD}"/bin/App/prospect-mail "$dpioptions" "$sandboxoptions" "$gpuoptions" &
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
			if [ -f ${exitclient} ]; then
				echo "exitclient flag present — app quit cleanly, wrapper exits"
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

		if [ -f ${killedclient} ] && [! -f ${exitclient} ]; then
			sleep_int 1
			launch_prospect
		fi
		if [ -f ${exitclient} ]; then
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
	# Send quit command via Unix socket (primary method)
	utoutlook_send_socket_cmd '{"cmd":"quit"}'
	# Fallback: write close flag file (picked up by heartbeat)
	echo "closed" >"${UTOUTLOOK_EXITCOMMAND}"
	utoutlook_notify "$(utoutlook_t 'shell.goodbye')"
	exit 0
}

export WD=$(pwd)
echo "$WD"

# Source shared functions and path constants
source "${WD}/utils/common.sh"

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

###init
declare -i i=0
test_net
export launchtry=1

oldfollow="0"
startupGrace=0
stagnantCount=0
"${WD}"/bin/rm -f ${exitclient}
"${WD}"/bin/rm -f ${killedclient}
"${WD}"/bin/rm -f /home/phablet/.config/utoutlook.mathias/close
# Supprime le heartbeat de la session précédente : tant qu'Electron n'a pas
# réécrit son premier compteur, verify_prospect_life verra un fichier absent
# (fenêtre de grâce) au lieu d'une valeur stale (fausse stagnation).
"${WD}"/bin/rm -f ${filelifefollow}
cleanup
"${WD}"/utils/mkdir
"${WD}"/bin/rm -f "/home/phablet/.cache/utoutlook.mathias/quit"
"${WD}"/bin/rm -f "/home/phablet/.config/utoutlook.mathias/close"
echo "################################################"
export GDK_SCALE=2
export GTK_IM_MODULE=Maliit
export GTK_IM_MODULE_FILE=/home/phablet/.config/utoutlook.mathias/immodules.cache
# v3.3.27: XMODIFIERS is what makes the Maliit virtual keyboard deliver keys to
# X11/Chromium apps — without it the on-screen keyboard types nothing (GTK_IM_MODULE
# alone only covers GTK apps).
export XMODIFIERS=@im=maliit
export QT_IM_MODULE=maliit
export GDK_BACKEND=x11
export DISABLE_WAYLAND=1
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
