#!/bin/bash
# batterie-tests.sh [version] — batterie de tests device pour UToutlook Mail
# Usage : ./batterie-tests.sh 4.3.0
#         ./batterie-tests.sh          (lit la version dans package.json)
#
# Prérequis : téléphone branché (adb XXXX), app installée.
# NE touche qu'à utoutlook — aucune autre application.
# Écrit le rapport dans ~/.config/utoutlook.mathias/batterie.log sur le device.
#
# ATTENTION : le CLI `lomiri-app-launch` peut sortir avec
# "Lost our connection with the registry" sans démarrer le service systemd.
# Dans ce cas le relance échoue alors que l'app elle-même est saine :
# vérifier le nombre de "=== wrapper start" dans wrapper.log pour distinguer
# un échec du lanceur d'un échec de l'app.

set -u
VERSION="${1:-$(grep '"version"' "$(dirname "$0")/utoulookmail/utoutlookmail/package.json" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')}"
DEVICE="${ADB_DEVICE:-XXXX}"
ADB="adb -s $DEVICE"

APPID="utoutlook.mathias_utoutlook_${VERSION}"
SVC="lomiri-app-launch--application-click--${APPID}--.service"
DIR="/home/phablet/.config/utoutlook.mathias"
SOCK="$DIR/utoutlook.sock"
LOG="$DIR/batterie.log"
TMP="$DIR/ping.tmp"

echo "=== Batterie de tests UToutlook $VERSION (device $DEVICE) ==="

# --- préparation : arrêter utoutlook uniquement ---
$ADB shell "pkill -9 -x prospect-mail 2>/dev/null || true
W=\$(cat $DIR/wrapper.pid 2>/dev/null | tr -d '[:space:]'); [ -n \"\$W\" ] && kill -9 \"\$W\" 2>/dev/null || true
sleep 4" >/dev/null

$ADB shell "cat > $DIR/.batterie-run.sh <<'EOS'
#!/bin/bash
export XDG_RUNTIME_DIR=/run/user/32011
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/32011/bus
D=$DIR
S=$SOCK
R=$TMP
L=$LOG
: > \"\$L\"
echo \"VERSION: \$(click list 2>/dev/null | grep -i utoutlook)\" >> \"\$L\"
echo \"=== TEST 1: lancement ===\" >> \"\$L\"
lomiri-app-launch $APPID >> \"\$L\" 2>&1
ok=0
for i in \$(seq 1 30); do
  sleep 1; : > \"\$R\"
  printf '{\"cmd\":\"ping\"}\\n' | timeout 2 nc -U \"\$S\" > \"\$R\" 2>/dev/null
  if grep -q pong \"\$R\"; then echo \"PING OK en \${i}s\" >> \"\$L\"; ok=1; break; fi
done
[ \"\$ok\" = 0 ] && echo \"PING ECHEC\" >> \"\$L\"
echo -n 'PROCESS electron=' >> \"\$L\"; ps -eo comm | grep -cx prospect-mail >> \"\$L\"
echo -n 'ICON unknown.qtmir=' >> \"\$L\"; gdbus introspect --session --dest com.lomiri.Shell --object-path /com/lomiri/Shell/Launcher --xml 2>/dev/null | grep -c unknown_2Eqtmir >> \"\$L\"
echo -n 'HEARTBEAT=' >> \"\$L\"; cat \"\$D/follow\" 2>/dev/null >> \"\$L\"; echo >> \"\$L\"
echo -n 'GRACE loops=' >> \"\$L\"; tail -60 \"\$D/wrapper.log\" | grep -c 'heartbeat not started yet' >> \"\$L\"
echo -n 'WRAPPER STARTS=' >> \"\$L\"; grep -c '=== wrapper start' \"\$D/wrapper.log\" >> \"\$L\"
echo '=== TEST 2-4: cycles quit/relance ===' >> \"\$L\"
for c in 1 2 3; do
  echo \"--- cycle \$c \$(date +%H:%M:%S)\" >> \"\$L\"
  echo -n 'avant-quit electron=' >> \"\$L\"; ps -eo comm | grep -cx prospect-mail >> \"\$L\"
  printf '{\"cmd\":\"quit\"}\\n' | timeout 3 nc -U \"\$S\" > \"\$R\" 2>&1
  for i in \$(seq 1 15); do sleep 1; [ \"\$(ps -eo comm | grep -cx prospect-mail)\" = 0 ] && { echo \"quit \${i}s\" >> \"\$L\"; break; }; done
  echo -n 'zombies=' >> \"\$L\"; ps -eo stat | grep -c Z >> \"\$L\"
  sleep 5
  starts_avant=\$(grep -c '=== wrapper start' \"\$D/wrapper.log\")
  lomiri-app-launch $APPID >> \"\$L\" 2>&1
  st=0
  for i in \$(seq 1 25); do sleep 1; : > \"\$R\"
    printf '{\"cmd\":\"ping\"}\\n' | timeout 2 nc -U \"\$S\" > \"\$R\" 2>/dev/null
    if grep -q pong \"\$R\"; then echo \"relance OK \${i}s\" >> \"\$L\"; st=1; break; fi
  done
  starts_apres=\$(grep -c '=== wrapper start' \"\$D/wrapper.log\")
  [ \"\$st\" = 0 ] && echo \"RELANCE ECHEC (wrapper starts \${starts_avant} -> \${starts_apres} : \$( [ \"\$starts_avant\" = \"\$starts_apres\" ] && echo 'lanceur systeme' || echo 'app' ))\" >> \"\$L\"
done
echo '=== TEST 5: langue ===' >> \"\$L\"
echo -n 'lang file=' >> \"\$L\"; cat \"\$D/lang\" 2>/dev/null >> \"\$L\"; echo >> \"\$L\"
echo -n 'unknown final=' >> \"\$L\"; gdbus introspect --session --dest com.lomiri.Shell --object-path /com/lomiri/Shell/Launcher --xml 2>/dev/null | grep -c unknown_2Eqtmir >> \"\$L\"
echo '=== FIN ===' >> \"\$L\"
EOS
chmod +x $DIR/.batterie-run.sh
nohup $DIR/.batterie-run.sh >/dev/null 2>&1 &
echo LANCÉ"

echo "Batterie lancée. Suivi :"
echo "  $ADB shell 'cat $LOG'"
echo "  $ADB shell 'tail -f $LOG'"
