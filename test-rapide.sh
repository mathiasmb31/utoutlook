#!/bin/bash
# Test rapide utoutlook sur le téléphone (adb XXXX)
# v4.1.10: PAS de `set -e` — c'est un outil de diagnostic : chaque section doit
# s'afficher même si la précédente échoue (ex. `head -1` ferme le pipe → SIGPIPE
# côté grep/device → adb retourne non-zéro → avec set -e le script s'arrêtait
# après « URL courante » et masquait toutes les sections suivantes).
set +e

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./test-rapide.sh [version]"
  echo "  Affiche les zombies AVANT le kill, tue les vieux process, lance l'app, puis affiche:"
  echo "  version installée, nb de process, heartbeat, URL courante,"
  echo "  dernières pages chargées, erreurs CSP/crash, boucles post.srf,"
  echo "  token sauvegardé (auth-token.json), restauration, MSAAUTH dans la DB"
  exit 0
fi

DEV="${DEVICE:-${ADB_SERIAL:-XXXX}}"
V="${1:-}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== Version installée ==="
if [ -n "$V" ]; then
  adb -s $DEV shell "click info utoutlook.mathias | grep version"
else
  adb -s $DEV shell "click info utoutlook.mathias | grep version"
fi

echo "=== Zombies avant kill ==="
adb -s $DEV shell "ps -eo pid,stat,comm | awk '\$2 ~ /Z/ {z++} END {print \"zombies: \" (z+0)}'; echo \"process utoutlook avant kill: \$(ps aux | grep -E 'prospect-mail|command.sh' | grep -v grep | wc -l)\""

echo "=== Kill vieux process (zombies) ==="
adb -s $DEV shell 'ps aux | grep -E "prospect-mail|command.sh" | grep -v grep | awk "{print \$2}" | while read p; do kill -9 $p 2>/dev/null; done; sleep 2; echo "reste: $(ps aux | grep -E "prospect-mail|command.sh" | grep -v grep | wc -l)"'

echo "=== Lancement ==="
adb -s $DEV shell 'rm -f /home/phablet/.config/utoutlook.mathias/wrapper.log /home/phablet/.config/utoutlook.mathias/utoutlook.sock'
V=$(adb -s $DEV shell 'click info utoutlook.mathias | grep version' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
adb -s $DEV shell "cd /opt/click.ubuntu.com/utoutlook.mathias/$V && setsid ./bin/command.sh > /dev/null 2>&1 &"
echo "attente 40s..."
sleep 40

echo "=== Process (doit être > 5 ; inclut command.sh + prospect-mail) ==="
adb -s $DEV shell 'ps aux | grep -E "prospect-mail|command.sh" | grep -v grep | wc -l'

echo "=== Heartbeat (doit augmenter) ==="
adb -s $DEV shell 'cat /home/phablet/.config/utoutlook.mathias/follow 2>/dev/null || echo "pas de heartbeat"'
sleep 5
adb -s $DEV shell 'cat /home/phablet/.config/utoutlook.mathias/follow 2>/dev/null'

echo "=== Socket IPC vivant (ping) ==="
adb -s $DEV shell "printf '%s\n' '{\"cmd\":\"ping\"}' | timeout 5 nc -U /home/phablet/.config/utoutlook.mathias/utoutlook.sock 2>&1 | head -1 || echo 'socket injoignable'"

echo "=== URL courante (depuis wrapper.log ; eval désactivé en release v4.1.0) ==="
# v4.1.6: la commande socket 'eval' est désactivée hors debug (UTOUTLOOK_DEBUG!=1)
# → on lisait plus rien. On prend la dernière URL de "Page loaded" dans le log,
# en ne gardant que domaine+chemin (JAMAIS la query string : jetons/state secrets).
adb -s $DEV shell 'grep "Page loaded" /home/phablet/.config/utoutlook.mathias/wrapper.log 2>/dev/null | tail -1 | grep -oE "https://[a-z0-9.-]+/[a-zA-Z0-9./_-]{0,50}" | head -1'

echo "=== Dernières pages chargées ==="
adb -s $DEV shell 'grep "Page loaded" /home/phablet/.config/utoutlook.mathias/wrapper.log 2>/dev/null | tail -6 | grep -oE "https://[a-z0-9.-]+/[a-zA-Z0-9./_-]{0,50}"'

echo "=== Erreurs récentes (CSP, crash, FATAL) ==="
adb -s $DEV shell 'grep -iE "FATAL|CSP|violates|Uncaught|SyntaxError" /home/phablet/.config/utoutlook.mathias/wrapper.log 2>/dev/null | tail -5 | cut -c1-180'

echo "=== Boucles détectées (doit être 0 si stable) ==="
adb -s $DEV shell 'grep -c "SPA navigation.*post.srf" /home/phablet/.config/utoutlook.mathias/wrapper.log 2>/dev/null || echo 0'

echo "=== Token sauvegardé ==="
adb -s $DEV shell "ls -la /home/phablet/.config/utoutlook.mathias/data/auth-token.json 2>/dev/null && cat /home/phablet/.config/utoutlook.mathias/data/auth-token.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(len(d) if isinstance(d,list) else 1) + \" cookie(s) sauvegarde(s)\")' 2>/dev/null || echo 'pas de token'"

echo "=== Restauration au dernier lancement ==="
adb -s $DEV shell 'grep -i "restaur" /home/phablet/.config/utoutlook.mathias/wrapper.log 2>/dev/null | tail -2'

echo "=== MSAAUTH dans la DB ==="
adb -s $DEV shell "sqlite3 /home/phablet/.config/utoutlook.mathias/prospect-mail/Partitions/utoutlook-default/Cookies \"SELECT COUNT(*) FROM cookies WHERE name LIKE '%MSAAUTH%';\" 2>/dev/null"

echo "=== FIN TEST ==="
