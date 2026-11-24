#!/bin/bash
# Rafraichir la liste d'applications du launcher Lomiri apres une install click.
# Utile apres un `clickable install` ou une install manuelle hors build-deploy.sh :
# sans cela, le launcher peut garder un ancien app_id versionne et ne plus
# demarrer l'app au tap sur l'icone (splash bloque).
# Le serial n'est JAMAIS ecrit ni affiche : ADB_DEVICE / ADB_SERIAL ou 1er device.
set -e

DEV="${ADB_DEVICE:-${ADB_SERIAL:-$(adb devices | awk 'NR==2{print $1}')}}"
[ -n "$DEV" ] || { echo "ERREUR: aucun device adb (definir ADB_DEVICE)"; exit 1; }

adb -s "$DEV" shell 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/32011/bus XDG_RUNTIME_DIR=/run/user/32011 gdbus call --session --dest com.lomiri.Shell --object-path /com/lomiri/Shell/Launcher --method com.lomiri.Shell.Launcher.Refresh 2>/dev/null' >/dev/null
echo "Launcher Lomiri rafraichi."
