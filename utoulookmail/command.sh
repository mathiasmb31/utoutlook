#!/bin/bash

# v4.0.58: SIGTERM/SIGINT/SIGKILL-proof — Lomiri tue le wrapper (process principal
# du click) au swipe-close. Sans trap sur TERM/INT/HUP, le EXIT trap ne tourne pas
# et le fils prospect-mail lancé en & reste ORPHELIN (vu: process 23 min après
# fermeture). SIGKILL ne peut pas être trappé, d'où le kill actif du fils dans
# close_command. Un flag évite la double exécution (signal → exit → EXIT trap).
CLOSE_DONE=0
# v4.2.4: BARRE QML DE DÉMARRAGE DÉSACTIVÉE — cause confirmée de l'icône jaune.
# Device 23:05 : avec la barre (v4.2.3) l'item `unknown.qtmir` apparaît dès
# l'affichage des écrans QML ; sans elle (v4.2.4), 0 item, 0 message AppMan
# « app that's not in the Launcher model », plus de double icône ni de splash
# bloqué. La barre avait été ajoutée en v4.0.105, juste après la v4.0.98
# saine signalée par Mathias. Le watchdog du wrapper est inchangé.
export UTOUTLOOK_DISABLE_STARTUP_QML=1
trap 'if [ "${CLOSE_DONE}" -eq 0 ]; then CLOSE_DONE=1; close_command; fi' EXIT
# v4.1.0 (revue A3): mémoriser que la sortie vient de Lomiri (swipe-close)
# pour ne pas transformer ce signal en quit propre côté Electron.
LOMIRI_TERM=0
trap 'LOMIRI_TERM=1; exit 0' TERM INT HUP

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
	# v4.1.0: ne jamais écraser le pidfile d'un wrapper PLUS RÉCENT encore
	# vivant — sinon les deux s'entretuent (revue pré-release, F3).
	local _pf="${UTOUTLOOK_DATA_DIR}/wrapper.pid" _owner=""
	[ -f "${_pf}" ] && _owner=$("${WD}"/bin/cat "${_pf}" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
	if [ -n "${_owner}" ] && [ "${_owner}" != "$$" ] && kill -0 "${_owner}" 2>/dev/null; then
		echo "wrapper $$ périmé (owner=${_owner}) — sortie"
		exit 0
	fi
	mkdir -p "${UTOUTLOOK_DATA_DIR}" 2>/dev/null || true
	echo $$ > "${_pf}" 2>/dev/null || true
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

# v4.1.0: flags GPU recalculés à chaque lancement — le mode peut basculer
# automatiquement entre deux tentatives (voir flip_render_mode).
# Electron 44 ne fournit plus libEGL.so/libGLESv2.so : les anciens flags ANGLE
# font échouer le GPU process (error_code=1002) puis FATAL. Le mode logiciel
# utilise donc --in-process-gpu + compositing CPU.
function compute_gpu_options() {
	local mode="$1"
	if [ "${mode}" = "software" ]; then
		gpuoptions="--in-process-gpu --disable-gpu --disable-gpu-compositing --enable-unsafe-swiftshader --disable-features=VaapiVideoDecoder,AcceleratedVideoDecoder"
	else
		gpuoptions="--in-process-gpu --disable-features=VaapiVideoDecoder,AcceleratedVideoDecoder"
	fi
}

# v4.1.0: après un échec de démarrage (heartbeat jamais écrit ou mort), tenter
# l'AUTRE mode d'affichage avant d'abandonner, avec un message i18n.
# Max 2 bascules par session pour éviter la boucle hardware <-> software.
function flip_render_mode() {
	if [ "${RENDER_FLIPS:-0}" -ge 2 ]; then
		echo "auto render fallback skipped (${RENDER_FLIPS} flips this session)"
		return 1
	fi
	# v4.3.2: ne JAMAIS rebasculer quand on est DEJA en software — le message
	# "passage en software" s'affichait alors que le mode etait deja software.
	# RENDER_MODE est deja resolu au demarrage (utoutlook_resolve_render_mode) :
	# s'il vaut software, on ne touche a rien et on ne notifie pas.
	if [ "${RENDER_MODE:-}" = "software" ]; then
		echo "already software — no flip, no notification"
		return 0
	fi
	local cur new
	# Lecture avec le BUILTIN read (les binaires cat/tr externes renvoyaient
	# vide au moment du flip : log "auto render fallback:  -> software").
	cur=""
	[ -f "${UTOUTLOOK_RENDER_MODE_FILE}" ] && read -r cur < "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null || true
	cur="${cur//[[:space:]]/}"
	case "${cur}" in
		software|on|1)
			echo "already software (file) — no flip, no notification"
			return 0
			;;
		*) new="software" ;;
	esac
	printf '%s' "${new}" > "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null || true
	RENDER_MODE="${new}"
	RENDER_FLIPS=$(( ${RENDER_FLIPS:-0} + 1 ))
	compute_gpu_options "${RENDER_MODE}"
	echo "auto render fallback: ${cur} -> ${new} (launchtry=${launchtry}, flip ${RENDER_FLIPS}/2)"
	utoutlook_notify "$(utoutlook_t 'shell.autoFallback')"
}

function launch_prospect() {
	# v4.1.0 (revue M2): heartbeat propre après un relaunch.
	"${WD}"/bin/rm -f "${filelifefollow}" 2>/dev/null || true
	oldfollow=""
	stagnantCount=0
	cleanup
	if [[ -f ${lock} ]]; then
		utoutlook_notify "$(utoutlook_t 'shell.waitClose')"
	fi
	launchtry=$((launchtry + 1))
	if [ "$launchtry" -gt 3 ]; then
		cleanup
		echo "tried too more " >${exitcommand}
		utoutlook_write_qml_i18n
		qmlscene "${UTOUTLOOK_CONFIG_DIR}"/nonetwork.qml &
		QML_PID=$!  # v4.0.58: pour que close_command puisse le tuer (pas d'orphelin)
		wait ${QML_PID} 2>/dev/null || true  # le wrapper reste vivant tant que la page nonetwork est affichée
		exit 0
	fi
	export APPDIR=${WD}/bin/App/

	# v4.0.126: la barre est désormais lancée au tout début du wrapper (avant
	# test_net et les cleanup). Ici on met seulement à jour l'étape affichée,
	# et on la relance si elle a disparu entre-temps.
	utoutlook_set_start_step 5
	if ! utoutlook_startup_qml_alive; then
		start_startup_qml
		utoutlook_set_start_step 5
	fi

	# Wait for notification service to be ready before sending welcome
	# (D-Bus Postal may not be up yet on first launch / boot)
	# v4.1.0: 6 s suffisent — utoutlook_notify() réessaie déjà 3×2 s si le
	# bus n'est pas prêt ; 15 s ajoutaient ~10 s à chaque démarrage.
	utoutlook_wait_notifications 6
	# v4.2.8: notification de démarrage déplacée côté Electron (10 s max,
	# seulement si la fenêtre n'est pas visible) — voir main.mjs.

	# v3.3.45: native Wayland client (Lomiri session) — Maliit OSK goes through
	# the Wayland text-input protocol, password fields included (as in 3.2.x).
	"${WD}"/bin/App/prospect-mail "$dpioptions" "$sandboxoptions" "$gpuoptions" &
	# v4.0.11: capture client PID — kill -0 (builtin, AppArmor-safe) tells us
	# whether OUR client is alive; used to ignore exitclient flags written by
	# a dying older process during upgrade.
	CLIENT_PID=$!
	utoutlook_set_start_step 6 # v4.1.0: Electron lancé, page en chargement
	# v4.0.65: enregistrer le VRAI pid du fils (kill_prospect_pids/prospect_alive
	# l'utilisent — le pidfile ne contenait que des pids de wrapper avant)
	echo "${CLIENT_PID}" >> "${UTOUTLOOK_PID_FILE}" 2>/dev/null || true
	i+=1
}

function verify_prospect_life() {

	# v4.3.6: PLUS DE ROUE SUR SIMPLE ROTATION — depuis v4.0.94 la rotation ne
	# fait plus quitter l'app (Electron recharge la page lui-meme) : le heartbeat
	# ne meurt pas, l'app est vivante. L'ancien code (v4.0.99) affichait quand
	# meme relaunch.qml des qu'un flag rotation frais apparaissait. Or cette
	# fenetre QML PLEIN ECRAN recouvre l'app, VOLE la session Mir et declenche
	# une cascade de repaints + reinit de l'observer ("No inbox element found")
	# → l'app parait bloquee, l'utilisateur ferme et relance en rafale (vu 20/11
	# 12h30). On supprime simplement l'affichage : la roue ne reste que pour le
	# vrai cas "heartbeat mort -> relance" (branche plus bas).
	if [ -f "${rotationflag}" ]; then
		"${WD}"/bin/rm -f "${rotationflag}" 2>/dev/null || true
	fi

	# v3.3.10: si un wrapper plus récent a pris la main (pidfile != $$), on sort
	# proprement — sinon deux wrappers de versions différentes se relancent
	# l'app l'un contre l'autre en boucle (vu à l'upgrade 3.3.9→3.3.10).
	local curpid
	curpid=$("${WD}"/bin/cat "${UTOUTLOOK_DATA_DIR}/wrapper.pid" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
	# v4.0.62: un pidfile périmé (wrapper enregistré mort — SIGKILL Lomiri) ne doit
	# PAS bloquer le lancement : ne céder que si le wrapper enregistré est VIVANT.
	if [ -n "${curpid}" ] && [ "${curpid}" != "$$" ] && kill -0 "${curpid}" 2>/dev/null; then
		echo "another wrapper (pid ${curpid}) owns the app — exiting"
		exit 0
	fi

	# Lecture sûre du heartbeat (le fichier peut ne pas exister encore)
	local follow=""
	if [ -f "${filelifefollow}" ]; then
		follow=$("${WD}"/bin/cat "${filelifefollow}" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
	fi

	# v4.3.7: ces 3 echoes tournaient toutes les 3 s (~1,5 ligne/s,
	# 130 000 lignes/jour) et remplissaient wrapper.log. On ne les garde
	# qu'en debug — la logique de stagnation ci-dessous est identique.
	if [ "${UTOUTLOOK_DEBUG:-0}" = "1" ]; then
		echo "FOLLOW"
		echo ${follow}
		echo ${oldfollow}
	fi

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
		# v4.1.0: au 2e échec, basculer automatiquement de mode d'affichage
		# (message i18n) au lieu de demander à l'utilisateur de relancer.
		if [ "${launchtry}" -gt 1 ]; then
			flip_render_mode || utoutlook_notify "$(utoutlook_t 'shell.pleaseRelaunch')"
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
		# v4.2.5: SUR DEVICE, Lomiri SIGKILL le wrapper (~3-5 s) dès que la
		# fenêtre se ferme — avant la 2e stagnation (≈6 s). Résultat : le flag
		# exitclient n'était jamais lu, le wrapper mourait sans trap EXIT
		# (pas de notification "goodbye"), et les flags périmés bloquaient le
		# relance une fois sur deux. Dès la 1re stagnation, si l'app a écrit
		# un exitclient FRAIS et NOUS APPARTENANT, c'est un vrai quit : sortir
		# immédiatement (le trap EXIT enverra "goodbye" et nettoiera).
		if utoutlook_flag_fresh "${exitclient}" && utoutlook_exitclient_ours "${exitclient}"; then
			echo "exitclient flag present (ours, fresh) at ${stagnantCount}/2 — clean quit, wrapper exits now"
			exit 0
		fi
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
			# v4.1.0: même bascule automatique sur heartbeat mort (hors quit propre).
			if [ "${launchtry}" -gt 1 ]; then
				flip_render_mode || true
			fi
			# v4.0.91: si l'app a quitté pour un changement d'orientation (flag
			# frais), afficher une roue plein écran pendant la relance — elle est
			# tuée dès que le nouvel app répond sur le socket (voir boucle while).
			if [ -f "${rotationflag}" ] && utoutlook_flag_fresh "${rotationflag}"; then
				"${WD}"/bin/rm -f "${rotationflag}" 2>/dev/null || true
				qmlscene -I "${UTOUTLOOK_CONFIG_DIR}" "${WD}"/qml/relaunch.qml > "${UTOUTLOOK_CONFIG_DIR}/relaunch-qml.log" 2>&1 &
				RELAUNCH_QML_PID=$!
				RELAUNCH_QML_SHOWN_AT=${EPOCHSECONDS:-0} # v4.0.107: builtin bash — /usr/bin/date est interdit par AppArmor
				echo "rotation relaunch screen shown (qml pid ${RELAUNCH_QML_PID})"
			else
				echo "******" && utoutlook_notify "$(utoutlook_t 'shell.cleaning')"
			fi
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
		# v4.0.105: l'app est vivante → fermer la barre de progression
		if [ -n "${STARTUP_QML_PID}" ]; then
			kill "${STARTUP_QML_PID}" 2>/dev/null || true
			wait "${STARTUP_QML_PID}" 2>/dev/null || true
			STARTUP_QML_PID=""
		fi
		touch ${lock}
		# v4.0.122: suppression totale du vidage des notifications. Le D-Bus
		# Postal ClearPersistent affichait une notification « clear » fugitive
		# dans le tiroir Lomiri à chaque lancement — sans intérêt pour l'user.
		# Les notifications transitoires (welcome, patientez) restent pendant
		# leur durée normale et disparaissent d'elles-mêmes.
	fi
	oldfollow=${follow}
	if [ ${clientalive} -eq 1 ]; then
		# v4.3.7: bruit de watchdog conserve uniquement en debug
		[ "${UTOUTLOOK_DEBUG:-0}" = "1" ] && echo "client is alive"
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
	# v4.3.7: idem — plus de "done" a chaque tick en production
	[ "${UTOUTLOOK_DEBUG:-0}" = "1" ] && echo "done"
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
	# v4.0.62: un pidfile périmé (wrapper enregistré mort — SIGKILL Lomiri) ne doit
	# PAS bloquer le lancement : ne céder que si le wrapper enregistré est VIVANT.
	if [ -n "${curpid}" ] && [ "${curpid}" != "$$" ] && kill -0 "${curpid}" 2>/dev/null; then
		exit 0
	fi
	# v4.0.37: mark "closing" immediately — any relaunch while we are shutting
	# down is refused with a "please wait" message (the bug happened when the
	# user tapped the icon before the goodbye notification was sent).
	echo "closing" > "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
	# v4.1.0 (revue A3): sur swipe-close Lomiri, NE PAS envoyer le quit —
	# l'app doit seulement masquer sa fenêtre et garder les notifications.
	if [ "${LOMIRI_TERM:-0}" = "1" ]; then
		# v4.1.0 (revue E2): signaler à l'app orpheline que sa fenêtre doit
		# rester masquée (le watchdog surface ne doit pas la ré-afficher).
		printf 'swipe' > "${UTOUTLOOK_SWIPE_HIDDEN}" 2>/dev/null || true
	else
		utoutlook_send_socket_cmd '{"cmd":"quit"}'
		"${WD}"/bin/rm -f "${UTOUTLOOK_SWIPE_HIDDEN}" 2>/dev/null || true
	fi
	# Fallback: write close flag file (picked up by heartbeat)
	# v4.0.14: embed wrapper PID so the app only honors OUR close flag
	echo "closed:${UTOUTLOOK_WRAPPER_PID}" >"${UTOUTLOOK_EXITCOMMAND}"
	# v4.3.3: le "goodbye" est envoye par Electron des que le bouton Quitter
	# est presse (cleanupAndExit) — ici Lomiri tue le wrapper par SIGKILL avant
	# que la notification parte, ce qui la faisait apparaitre au lancement
	# suivant. Ne pas le renvoyer ici (doublon + retard).
	# v4.0.105: tuer la barre de démarrage si l'app ferme avant qu'elle ne se ferme
	if [ -n "${STARTUP_QML_PID}" ]; then
		kill "${STARTUP_QML_PID}" 2>/dev/null || true
		wait "${STARTUP_QML_PID}" 2>/dev/null || true
		STARTUP_QML_PID=""
	fi
	# v4.0.91: tuer aussi l'écran de relance (roue) s'il est encore affiché
	if [ -n "${RELAUNCH_QML_PID}" ]; then
		kill "${RELAUNCH_QML_PID}" 2>/dev/null || true
		wait "${RELAUNCH_QML_PID}" 2>/dev/null || true # v4.0.99: récupérer le zombie
		RELAUNCH_QML_PID=""
	fi
	# v4.0.58: tuer ACTIVEMENT notre fils prospect-mail — ne pas compter sur le
	# socket/flag seuls : si l'app est pendue ou si le wrapper a reçu SIGKILL,
	# personne ne le tue et il reste orphelin indéfiniment. kill sur notre propre
	# fils = même label AppArmor, autorisé.
	if [ "${LOMIRI_TERM:-0}" != "1" ] && [ -n "${CLIENT_PID}" ] && [ "${CLIENT_PID}" != "0" ] && kill -0 "${CLIENT_PID}" 2>/dev/null; then
		# v4.1.0: flag wrapper-quit → vrai quit propre (l'app reapera ses
		# sous-process Chromium) au lieu d'un hide puis SIGKILL.
		printf 'quit:%s' "$$" > "${UTOUTLOOK_FORCE_QUIT}" 2>/dev/null || true
		kill -TERM "${CLIENT_PID}" 2>/dev/null || true
		_w=0
		while [ ${_w} -lt 5 ] && kill -0 "${CLIENT_PID}" 2>/dev/null; do
			sleep_int 1
			_w=$((_w + 1))
		done
		kill -9 "${CLIENT_PID}" 2>/dev/null || true
		"${WD}"/bin/rm -f "${UTOUTLOOK_FORCE_QUIT}" 2>/dev/null || true
		wait "${CLIENT_PID}" 2>/dev/null || true # v4.0.99: récupérer le zombie
	fi
	# v4.0.58: idem pour un éventuel qmlscene nonetwork.qml lancé par ce wrapper
	# v4.3.7 (21/11): QML_PID est initialise a 0 et `[ -n "0" ]` est VRAI —
	# sans ce garde-fou, ce bloc executait `kill -9 0` (signal a TOUT le
	# groupe de processus) puis `wait 0` (attente de TOUS les enfants) alors
	# qu'aucun ecran QML n'avait ete lance. Garde-fou de securite independant
	# du correctif du watchdog (suppression du sleep_int 15 plus bas).
	if [ -n "${QML_PID}" ] && [ "${QML_PID}" != "0" ] && kill -0 "${QML_PID}" 2>/dev/null; then
		kill -9 "${QML_PID}" 2>/dev/null || true
		wait "${QML_PID}" 2>/dev/null || true # v4.0.99: récupérer le zombie
	fi
	"${UTOUTLOOK_BIN}/pkill" -9 qmlscene 2>/dev/null || true
	# v4.0.37: closing is done — remove the flag so the next launch is accepted
	"${WD}"/bin/rm -f "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
	exit 0
}

# v4.1.11: `pwd` (builtin) lit le VRAI cwd (/proc/<pid>/cwd), qui est le dossier
# du click même quand la variable d'env PWD est périmée (/home/phablet) — cas
# vécu avec les relances setsid. `pwd -P` résout les liens symboliques (ex:
# /.click/users/@all -> /opt/click.../<version>). On garde un garde-fou : si
# le cwd ne contient pas 'utoutlook.mathias', on tente de le déduire de $0.
export WD="$(pwd -P 2>/dev/null || pwd)"
case "$WD" in
  *utoutlook.mathias*) ;;
  *)
    _SRC="${BASH_SOURCE[0]}"
    case "$_SRC" in
      *utoutlook.mathias*) WD="${_SRC%/bin/command.sh}" ;;
    esac
    ;;
esac
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
export rotationflag="${UTOUTLOOK_ROTATIONFLAG}"
RELAUNCH_QML_PID=""
RELAUNCH_QML_SHOWN_AT=0
# v4.0.105: écran de démarrage (barre de progression) superposé à la splash Lomiri
STARTUP_QML_PID=""
export killedclient="${UTOUTLOOK_KILLEDCLIENT}"
export filelifefollow="${UTOUTLOOK_FILELIFE}"
export exitcommand="${UTOUTLOOK_EXITCOMMAND}"
export socketpath="${UTOUTLOOK_SOCKET}"
# v4.0.14: PID of THIS wrapper, passed to prospect-mail via env so the app can
# tell a close flag written by ITS wrapper apart from one written by a dying
# older wrapper (race: old wrapper writes "closed" after the new one cleaned up).
export UTOUTLOOK_WRAPPER_PID=$$
# v4.3.7 (21/11): capturer le PID du wrapper PRECEDENT avant que cleanup()
# n'ecrase le pidfile. Sert a detecter une instance Electron ORPHELINE (son
# wrapper a ete SIGKILL par Lomiri apres la fermeture de la fenetre).
PREV_WRAPPER_PID=$("${WD}"/bin/cat "${UTOUTLOOK_DATA_DIR}/wrapper.pid" 2>/dev/null | "${WD}"/bin/tr -d '[:space:]')
export UTOUTLOOK_SWIPE_HIDDEN="${UTOUTLOOK_CONFIG_DIR}/swipe-hidden"
"${WD}"/bin/rm -f "${UTOUTLOOK_SWIPE_HIDDEN}" 2>/dev/null || true
# v4.1.0: repartir d'un pidfile vide (revue M1).
: > "${UTOUTLOOK_DATA_DIR}/__prospect.pid" 2>/dev/null || true

# v4.1.0: prendre la propriété du wrapper AVANT toute attente. Sans ça, deux
# wrappers lancés à ~20 s d'intervalle (Lomiri relance pendant que le 1er
# attend encore) s'entretuent via le scan pgrep, et le plus ancien reprend
# tout son démarrage → étape 3 bloquée ~45 s. Le plus récent gagne désormais
# immédiatement : l'ancien se voit périmé dans utoutlook_kill_stale_wrappers.
mkdir -p "${UTOUTLOOK_DATA_DIR}" 2>/dev/null || true
echo $$ > "${UTOUTLOOK_DATA_DIR}/wrapper.pid" 2>/dev/null || true

# v4.2.8: le message "démarrage" n'est plus envoyé ici — c'est Electron qui
# l'envoie après 10 s SEULEMENT si la fenêtre principale n'est toujours pas
# visible (voir main.mjs). Évite de notifier sur les démarrages rapides.

# v4.0.126: afficher la barre de démarrage LE PLUS TÔT POSSIBLE — ici, avant
# test_net (jusqu'à 6 s de sondes), avant les 3 cleanup() et avant l'attente
# du service de notifications (15 s). Les nettoyages ne la tuent plus :
# utoutlook_kill_qmlscene() préserve notre STARTUP_QML_PID.
function start_startup_qml() {
	if utoutlook_startup_qml_alive; then
		return 0
	fi
	utoutlook_write_qml_i18n
	UTOUTLOOK_STARTUP_LAUNCHING=1
	utoutlook_set_start_step "${1:-1}"
	UTOUTLOOK_STARTUP_LAUNCHING=0
	utoutlook_kill_qmlscene # v4.1.0: préserve STARTUP_QML_PID et RELAUNCH_QML_PID
	# v4.2.4: ne pas créer la fenêtre QML de démarrage (voir note en tête de
	# fichier — c'était elle qui créait l'item inconnu `unknown.qtmir`).
	if [ "${UTOUTLOOK_DISABLE_STARTUP_QML:-0}" = "1" ]; then
		echo "startup QML bar disabled (experiment v4.2.4)"
		return 0
	fi
	qmlscene "${UTOUTLOOK_STARTUP_QML}" > "${UTOUTLOOK_CONFIG_DIR}/startup-qml.log" 2>&1 &
	STARTUP_QML_PID=$!
	echo "startup progress screen shown early (qml pid ${STARTUP_QML_PID})"
}

# v4.0.128: écran de secours rendu logiciel / OpenGL. Affiché uniquement
# après un crash GPU FRAIS et sans override manuel. Le QML ne peut pas écrire
# de fichier : il loggue UT_RENDER_CHOICE=... sur stdout puis sort avec un
# code distinct (10=software, 11=opengl) — le code de sortie sert de secours
# si le buffer stdout n'est pas vidé. v4.1.0: fenêtre activée (focus Mir) et
# délai porté à 30 s (retour utilisateur : clic pas capté / trop rapide).
function show_render_rescue() {
	local log="${UTOUTLOOK_CONFIG_DIR}/render-rescue-qml.log"
	local qpid i=0 rc=0
	utoutlook_write_rescue_qml # v4.1.0: généré dans le dossier de l'app (AppArmor)
	: > "${log}" 2>/dev/null || true
	qmlscene "${UTOUTLOOK_CONFIG_DIR}"/render-rescue.qml > "${log}" 2>&1 &
	qpid=$!
	while [ ${i} -lt 30 ] && kill -0 "${qpid}" 2>/dev/null; do
		sleep_int 1
		i=$((i + 1))
	done
	if kill -0 "${qpid}" 2>/dev/null; then
		kill "${qpid}" 2>/dev/null || true
		wait "${qpid}" 2>/dev/null || true
		echo "render rescue timeout (30s) — keeping automatic software mode"
		return
	fi
	wait "${qpid}" 2>/dev/null || rc=$?
	echo "render rescue: qmlscene exit=$rc"
	if [ "${rc}" -eq 11 ] || "${UTOUTLOOK_BIN}/grep" -qa 'UT_RENDER_CHOICE=opengl' "${log}" 2>/dev/null; then
		printf 'hardware' > "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null || true
		RENDER_MODE="hardware"
		echo "render rescue: OpenGL chosen"
	elif [ "${rc}" -eq 10 ] || "${UTOUTLOOK_BIN}/grep" -qa 'UT_RENDER_CHOICE=software' "${log}" 2>/dev/null; then
		printf 'software' > "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null || true
		RENDER_MODE="software"
		echo "render rescue: software chosen"
	else
		echo "render rescue: no choice marker — keeping automatic software mode"
	fi
}

###init
declare -i i=0
start_startup_qml # v4.0.126: écran visible dès la 1re ligne active
utoutlook_set_start_step 2
test_net
utoutlook_set_start_step 3
export launchtry=1
RENDER_FLIPS=0  # v4.1.0: max 2 bascules auto par session

oldfollow="0"
startupGrace=0
stagnantCount=0
# v4.0.11: PID of the prospect-mail process launched by THIS wrapper (0 = none)
CLIENT_PID=0
# v4.0.58: PID of a qmlscene (nonetwork.qml) launched by THIS wrapper
QML_PID=0
# v4.0.10: freshness marker for lifecycle flags (exitclient/killedmail) —
# created ONCE here; utoutlook_flag_fresh() only honors flags written after
# this moment, so stale flags persisted by a pre-3.0 version (or rewritten
# by a surviving old process during the upgrade) are ignored.
export UTOUTLOOK_WRAPPER_MARKER="${UTOUTLOOK_CONFIG_DIR}/.wrapper-start"
: > "${UTOUTLOOK_WRAPPER_MARKER}" 2>/dev/null || true
"${WD}"/bin/rm -f ${exitclient}
"${WD}"/bin/rm -f ${killedclient}
"${WD}"/bin/rm -f ${HOME}/.config/utoutlook.mathias/close
# Supprime le heartbeat de la session précédente : tant qu'Electron n'a pas
# réécrit son premier compteur, verify_prospect_life verra un fichier absent
# (fenêtre de grâce) au lieu d'une valeur stale (fausse stagnation).
"${WD}"/bin/rm -f ${filelifefollow}
# v4.0.21: aggressive startup reset — after a swipe-close, old processes can
# survive (AppArmor blocks cross-label kill) and old wrappers can rewrite flags
# while dying, which made the NEXT launch slow-then-exit. Kill everything that
# looks like a previous utoutlook instance, wait for them to die, then clear
# every lifecycle flag so this launch starts from a clean slate.
# v4.1.0: SIGTERM (avec flag wrapper-quit) plutôt que SIGKILL — un SIGKILL
# du process principal orphelinait ses sous-processus Chromium → zombies.
printf 'quit:%s' "$$" > "${UTOUTLOOK_FORCE_QUIT}" 2>/dev/null || true
"${WD}"/bin/pkill -TERM -f "bin/App/prospect-mail" 2>/dev/null || true
# v4.0.62: pkill/pgrep -f sont aveugles sous AppArmor (ne voient pas les autres
# process) — tuer AUSSI via les pidfiles enregistrés et le scan /proc/*/exe.
prospect_alive() {
	# v4.1.0: délègue à utoutlook_prospect_running() qui IGNORE les zombies —
	# sinon pgrep -f/kill -0 voient les <defunct> (parent 1) comme vivants et
	# la boucle d'attente tourne 10 s pour rien (~50 s au total sur l'étape 3).
	utoutlook_prospect_running
}
kill_prospect_pids() {
	local _pid
	[ -f "${UTOUTLOOK_PID_FILE}" ] || return 0
	while IFS= read -r _pid; do
		_pid=$("${WD}"/bin/tr -d '[:space:]' <<<"${_pid}")
		# v4.1.0: TERM d'abord (wrapper-quit est posé) — SIGKILL en dernier
		# recours seulement dans utoutlook_kill_app() après 5 s d'attente.
		# v4.1.0: ne jamais envoyer TERM à un PID périmé/recyclé (revue M1).
		if [ -n "${_pid}" ] && utoutlook_pid_is_prospect "${_pid}" && ! utoutlook_pid_is_zombie "${_pid}"; then
			kill -TERM "${_pid}" 2>/dev/null || true
		fi
	done < "${UTOUTLOOK_PID_FILE}"
	utoutlook_kill_by_proc 2>/dev/null || true
}
kill_prospect_pids
# v4.0.34: ask any surviving old app (cross-label, pkill is blocked by
# AppArmor) to quit cleanly via the shared Unix socket — same socket path for
# all versions, so the quit command reaches even an old-version process.
utoutlook_send_socket_cmd '{"cmd":"quit"}'
# v4.1.0: suppression du scan /proc inconditionnel (revue M3) — il pouvait
# faire s'entretuer deux wrappers. utoutlook_kill_stale_wrappers() gère
# l'arbitrage via pidfile + vérification /proc/cmdline.
# v4.0.25: wait actively (max ~10s) for ALL old prospect-mail processes to die
# before launching — Lomiri SIGTERMs the process on swipe-close and a dying old
# process can rewrite lifecycle flags while the new one starts (race → "slow
# splash then exit" on relaunch). Retry loop instead of a fixed sleep.
_i=0
while [ ${_i} -lt 10 ]; do
	if prospect_alive; then
		# v4.0.25: notify the user once while we wait for the old process to die
		if [ ${_i} -eq 0 ]; then
			utoutlook_notify "$(utoutlook_t 'shell.waitingClose')"
		fi
		kill_prospect_pids   # v4.0.62: re-tuer à chaque itération (pidfiles + /proc)
		sleep_int 1
		_i=$((_i + 1))
	else
		break
	fi
done
# v4.0.90: délai de grâce après la mort des vieux process — le GPU process
# (--in-process-gpu) peut échouer au lancement (error_code=1002, FATAL "GPU
# process isn't usable") si on relance trop vite après un kill. 2 s laissent
# au compositor le temps de libérer les ressources.
sleep_int 2
# v4.1.0: l'étape 3 (extinction des anciens process) peut durer ~50 s —
# on passe à l'étape 4 dès qu'ils sont morts, avant les nettoyages suivants.
utoutlook_set_start_step 4
# v4.1.0: NE PAS supprimer UTOUTLOOK_CLOSING ici — le bloc ci-dessous doit
# pouvoir le voir (revue pré-release, F4 : code mort).
"${WD}"/bin/rm -f ${exitclient} ${killedclient} "${UTOUTLOOK_EXITCOMMAND}" 2>/dev/null || true
cleanup
"${WD}"/utils/mkdir
"${WD}"/bin/rm -f "${HOME}/.cache/utoutlook.mathias/quit"
"${WD}"/bin/rm -f "${HOME}/.config/utoutlook.mathias/close"

# v4.0.35: if another instance answers the socket, ask it to show the app —
# but re-check after a short delay: if it died in between (SIGTERM from a
# swipe-close racing us), fall through and start normally instead of exiting
# into a void (intermittent "nothing happens" on relaunch).
if utoutlook_socket_ping; then
	# v4.3.7 (21/11): apres une fermeture, Lomiri SIGKILL le wrapper mais
	# l'ancien Electron peut rester vivant encore quelques secondes (fenetre
	# masquee). Son wrapper est MORT : le reutiliser (show) le ferait quitter
	# des que la supervision inverse se declenche -> "au revoir" au relance.
	# On detecte ce cas via le pidfile quiet par l'ancien wrapper, on lui
	# demande un quit SILENCIEUX (cote Electron, wrapper deja mort = pas de
	# goodbye), on attend sa mort, puis on repart neuf. UNIQUEMENT ce cas.
	if [ -n "${PREV_WRAPPER_PID}" ] && [ "${PREV_WRAPPER_PID}" != "$$" ] && \
	   ! kill -0 "${PREV_WRAPPER_PID}" 2>/dev/null; then
		echo "orphaned instance (wrapper ${PREV_WRAPPER_PID} gone) — closing it before fresh launch (pid $$)"
		utoutlook_send_socket_cmd '{"cmd":"quit"}'
		_i=0
		while [ ${_i} -lt 8 ] && utoutlook_socket_ping; do
			sleep_int 1
			_i=$((_i + 1))
		done
		echo "orphan closed after ${_i}s — launching fresh (pid $$)"
	else
		echo "app already running — asking it to show (pid $$)"
		utoutlook_send_socket_cmd '{"cmd":"show"}'
		sleep_int 2
		if utoutlook_socket_ping; then
			exit 0
		fi
		echo "previous instance died after show — starting fresh (pid $$)"
	fi
fi
# v4.0.37: refuse to launch while a previous instance is still closing (flag
# set between SIGTERM and the goodbye notification, removed after). Wait up to
# 8s for the flag to disappear; if it never does (ghost), remove it and launch.
# v4.0.61: a closing flag OLDER than this wrapper's start marker is a ghost
# (previous wrapper was SIGKILLed before finishing the goodbye) — do NOT wait
# 8s on it, remove it and launch immediately. Only a FRESH flag (previous
# instance still closing right now) triggers the short wait.
if [ -f "${UTOUTLOOK_CLOSING}" ]; then
	if utoutlook_flag_fresh "${UTOUTLOOK_CLOSING}"; then
		echo "app is closing — waiting for goodbye before launching (pid $$)"
		_i=0
		# v4.1.0: 4×2 s = 8 s au lieu de 5×3 s = 15 s — la notification est
		# rejouée à chaque tour, inutile d'attendre plus pour un flag frais.
		while [ ${_i} -lt 4 ] && [ -f "${UTOUTLOOK_CLOSING}" ]; do
			utoutlook_notify "$(utoutlook_t 'shell.pleaseWait')"
			sleep_int 2
			_i=$((_i + 1))
		done
		if [ -f "${UTOUTLOOK_CLOSING}" ]; then
			echo "closing flag stuck >8s (ghost) — removing and launching (pid $$)"
		else
			echo "closing finished — launching (pid $$)"
		fi
	else
		echo "stale closing flag (previous wrapper died before goodbye) — removing and launching (pid $$)"
	fi
	"${WD}"/bin/rm -f "${UTOUTLOOK_CLOSING}" 2>/dev/null || true
fi
echo "################################################"
export GDK_SCALE=2
export GTK_IM_MODULE=Maliit
export GTK_IM_MODULE_FILE=${HOME}/.config/utoutlook.mathias/immodules.cache
# v3.3.27: XMODIFIERS is what makes the Maliit virtual keyboard deliver keys to
# X11/Chromium apps — without it the on-screen keyboard types nothing (GTK_IM_MODULE
# alone only covers GTK apps).
export XMODIFIERS=@im=maliit
export QT_IM_MODULE=maliit
# v3.3.45: keep the native Wayland session (do NOT unset WAYLAND_DISPLAY) —
# Chromium then talks to Maliit through the Wayland text-input protocol.
# XMODIFIERS/QT_IM_MODULE are kept for the X11/XWayland fallback path.
export DCONF_PROFILE=/nonexistent
export XDG_CONFIG_HOME=${HOME}/.config/utoutlook.mathias/
export XDG_DATA_HOME=${HOME}/.config/utoutlook.mathias/
export XDG_DESKTOP_DIR=${HOME}/.config/utoutlook.mathias/
export LD_LIBRARY_PATH=$PWD/lib/aarch64-linux-gnu/

echo "\"$PWD/lib/aarch64-linux-gnu/gtk-3.0/3.0.0/immodules/im-maliit.so\"" >${HOME}/.config/utoutlook.mathias/immodules.cache
echo "\"Maliit\" \"Maliit Input Method\" \"maliit\" \"\" \"en:ja:ko:zh:*\"" >>${HOME}/.config/utoutlook.mathias/immodules.cache
echo "XDG_DESKTOP_DIR=\"${HOME}/.cache/utoutlook.mathias/downloads/\"" >${HOME}/.config/utoutlook.mathias/user-dirs.dirs

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
echo $$ >>${HOME}/.config/utoutlook.mathias/data/__prospect.pid

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
# v4.0.107: get-scale.sh peut renvoyer 0 (getprop bloqué au boot) → facteur
# d'échelle nul → toute l'UI minuscule (vu sur device : instance orpheline
# lancée avec un facteur nul). On réessaie une fois, puis on retombe sur
# 1.00 (jamais zéro).
if [ -z "${appScaling}" ] || [ "${appScaling}" -lt 50 ] 2>/dev/null; then
	appScaling=$("${WD}"/utils/get-scale.sh 2>/dev/null)
fi
if [ -z "${appScaling}" ] || [ "${appScaling}" -lt 50 ] 2>/dev/null; then
	appScaling=115
	echo "get-scale returned invalid value — using 1.00 fallback"
fi

scaling="$((appScaling / 115)).$(printf '%02d' "$((appScaling % 115))")"

dpioptions="--high-dpi-support=1 --force-device-scale-factor=$scaling  --text-font-size=$textFontSize --span-font-size=$spanFontSize"
sandboxoptions="--no-sandbox"
# v4.2.3: RETOUR À L'ÉTAT v4.0.98 — plus AUCUN --class, plus aucun
# APP_CLASS_ID. C'est le commit 8a40c2e (v4.1.0) qui a INTRODUIT
# `--class=utoutlook.mathias_utoutlook` + StartupWMClass + setDesktopName
# et, dans la foulée, l'icône jaune `unknown.qtmir` (le user confirme :
# aucun problème en v4.0.98). whatslectron, l'autre app Electron du device,
# ne passe aucun --class et n'a pas d'icône jaune. On restaure donc
# exactement le comportement v4.0.98 : Electron garde son identité par
# défaut, le wrapper reste process principal (watchdog préservé).
# v3.3.8: --in-process-gpu instead of --disable-gpu --disable-software-rasterizer.
# With --disable-software-rasterizer there was NO fallback, and when Chromium
# tried to spawn a separate GPU process and failed 3x (error_code=1002),
# it hit FATAL "GPU process isn't usable. Goodbye." and killed the app.
# In-process GPU avoids that FATAL; software raster stays enabled.
gpuoptions="--in-process-gpu --disable-features=VaapiVideoDecoder,AcceleratedVideoDecoder"

# v4.0.127: rendu logiciel automatique après un crash GPU (OnePlus N10 et
# modèles similaires — avis OpenStore du 13/11), avec override fichier.
# SwiftShader est conservé dans le click depuis cette version (afterPack.mjs).
# v4.0.128: si le passage en logiciel vient d'un crash GPU FRAIS (et que
# l'utilisateur n'a pas déjà forcé un mode), laisser un choix visible 8 s
# avant de lancer Electron. Sinon, appliquer directement (mode auto silencieux).
GPU_CRASH_NEW=0
CUR_RENDER_MODE=""
# v4.3.8: lecture avec le BUILTIN read (cat/tr externes pouvaient renvoyer vide)
if [ -f "${UTOUTLOOK_RENDER_MODE_FILE}" ]; then
	read -r CUR_RENDER_MODE < "${UTOUTLOOK_RENDER_MODE_FILE}" 2>/dev/null || true
fi
CUR_RENDER_MODE="${CUR_RENDER_MODE//[[:space:]]/}"
HAS_RENDER_OVERRIDE=0
case "${CUR_RENDER_MODE}" in
	software|on|1|hardware|off|0) HAS_RENDER_OVERRIDE=1 ;;
esac
# On detecte le crash FRAIS meme avec un override (utile pour la notification),
# mais l'ecran de secours reste reserve aux cas sans choix manuel.
if utoutlook_gpu_crash_is_new; then GPU_CRASH_NEW=1; fi

RENDER_MODE=$(utoutlook_resolve_render_mode)

if [ "${GPU_CRASH_NEW}" -eq 1 ] && [ "${HAS_RENDER_OVERRIDE}" -eq 0 ]; then
	# fermer la barre de progression pour que l'écran de secours soit seul
	if [ -n "${STARTUP_QML_PID}" ]; then
		kill "${STARTUP_QML_PID}" 2>/dev/null || true
		wait "${STARTUP_QML_PID}" 2>/dev/null || true
		STARTUP_QML_PID=""
	fi
	show_render_rescue
	start_startup_qml # réafficher la barre après le choix
	utoutlook_set_start_step 5
fi

compute_gpu_options "${RENDER_MODE}"
if [ "${RENDER_MODE}" = "software" ]; then
	echo "software rendering enabled (render-mode=${RENDER_MODE})"
	# v4.3.8: le message "apres un crash graphique" ne doit apparaitre QUE
	# lors du basculement reel. render-mode=software persistant (choisi par
	# l'utilisateur ou suite a un ancien crash) ne notifie plus a chaque
	# lancement.
	if [ "${GPU_CRASH_NEW}" -eq 1 ]; then
		case "${CUR_RENDER_MODE}" in
			software|on|1) : ;; # deja logiciel : aucun message
			*) utoutlook_notify "$(utoutlook_t 'shell.softwareMode')" ;;
		esac
	fi
else
	echo "hardware rendering (render-mode=${RENDER_MODE})"
fi

echo "launch utoutlookmail"

echo "----------------------------------------------------------------------"

echo "----------------------------------------------------------------------"
launch_prospect
# v4.0.126: la barre est lancée au début du wrapper (voir start_startup_qml),
# bien avant test_net / cleanup / attente notifications — ici rien de plus.

# v4.3.7 (21/11): SUPPRESSION du sleep_int 15 heritage de 2026-08. Ce delai
# rendait le wrapper AVEUGLE pendant ~18 s (15 s + 3 s) apres le lancement :
# si l'utilisateur quittait dans cette fenetre (typiquement des que la page
# mail apparait), le watchdog ne detectait pas la mort d'Electron, le service
# systemd restait actif et un relance rapide via lomiri-app-launch plantait
# (SIGSEGV 139) sans rien demarrer. verify_prospect_life() a DEJA son propre
# startupGrace (20 lectures x 3 s = 60 s) pour les demarrages lents : ce
# sommeil supplementaire etait redondant. Le premier tick arrive desormais
# 3 s apres le lancement (mesure device : detection a +3 s au lieu de +21 s).
while true; do
	# v4.3.7 (21/11): LONG-POLL evenementiel au lieu de `sleep_int 3`.
	# Electron garde la connexion ouverte 3 s (cmd=hold) et repond held:true.
	# Le C (socketcli) bloque dans select() : aucun sleep externe, aucune
	# boucle de polling dans le shell. Sur un quit propre, Electron ferme le
	# socket -> select() rend la main IMMEDIATEMENT (plus de latence de 3 s).
	# 4e argument "wait" : reessais de connexion pendant le demarrage froid
	# (socket pas encore cree) sans faire tourner le shell en boucle serree.
	# Le timeout 5 s couvre le cas d'un event-loop Electron bloque : verify()
	# fait alors le garde-fou stagnation/hang habituel.
	HOLD_ANS=$("${WD}"/bin/socketcli "${socketpath}" '{"cmd":"hold","ms":3000}' 4 wait 2>/dev/null || true)
	# Electron annonce explicitement son quit des le debut de cleanupAndExit :
	# on sort IMMEDIATEMENT, sans attendre le timer 3 s ni la fermeture du
	# socket (qui declencherait 4 s de reessais en mode wait).
	case "${HOLD_ANS}" in
		*'"quitting":true'*)
			echo "clean quit announced by Electron — wrapper exits now"
			exit 0 ;;
	esac

	verify_prospect_life

	# v4.0.91: fermer l'écran de relance (roue) dès que le nouvel app répond
	_now=${EPOCHSECONDS:-0} # v4.0.107: builtin bash (pas de /usr/bin/date sous AppArmor)
	if [ -n "${RELAUNCH_QML_PID}" ] && kill -0 "${RELAUNCH_QML_PID}" 2>/dev/null && utoutlook_socket_ping && [ $((_now - ${RELAUNCH_QML_SHOWN_AT:-0})) -ge 5 ]; then
		kill "${RELAUNCH_QML_PID}" 2>/dev/null || true
		wait "${RELAUNCH_QML_PID}" 2>/dev/null || true # v4.0.99: récupérer le zombie
		RELAUNCH_QML_PID=""
		# v4.3.1: la fenêtre QML de relance prend la session Mir ; quand on
		# la tue, Electron ne récupère PAS la sienne (device 20/11 11:15 :
		# faux rotation -> relaunch.qml -> app vivante mais invisible, un
		# `show` socket recréait la session). On renvoie `show` après fermeture.
		utoutlook_send_socket_cmd '{"cmd":"show"}'
		echo "relaunch screen closed — client is back"
	fi

	# v4.0.111: FILET DE SÉCURITÉ — si le ping socket reste faux (python3 -c
	# bloqué par AppArmor dans le wrapper, ou instance fantôme qui répond à
	# moitié), la roue restait affichée indéfiniment. On la ferme au bout de
	# 20 s maximum, même sans ping : mieux vaut masquer la roue que bloquer
	# l'utilisateur sur un écran figé.
	if [ -n "${RELAUNCH_QML_PID}" ] && kill -0 "${RELAUNCH_QML_PID}" 2>/dev/null && [ $((_now - ${RELAUNCH_QML_SHOWN_AT:-0})) -ge 20 ]; then
		kill "${RELAUNCH_QML_PID}" 2>/dev/null || true
		wait "${RELAUNCH_QML_PID}" 2>/dev/null || true
		RELAUNCH_QML_PID=""
		utoutlook_send_socket_cmd '{"cmd":"show"}' # v4.3.1: récupérer la session Mir
		echo "relaunch screen closed — watchdog timeout (20s) — client is back"
	fi

done
