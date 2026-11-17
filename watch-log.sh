#!/bin/bash
# Watch les logs utoutlook en live sur le téléphone (adb XXXX)
# Usage: ./watch-log.sh [filtre]
#   ./watch-log.sh           → tous les logs (sans le bruit FOLLOW/heartbeat)
#   ./watch-log.sh error     → seulement les erreurs
#   ./watch-log.sh loop      → seulement les boucles/2FA/rechargements
set -e

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: ./watch-log.sh [filtre]"
  echo "  filtre: error | loop | page | cookie | (vide = tout sans FOLLOW)"
  echo "  Exemples:"
  echo "    ./watch-log.sh          → tout en live"
  echo "    ./watch-log.sh error    → erreurs seulement"
  echo "    ./watch-log.sh loop     → boucles 2FA / rechargements / resync"
  exit 0
fi

DEV="XXXX"
LOG="/home/phablet/.config/utoutlook.mathias/wrapper.log"
FILTER="${1:-}"

echo "Watch $LOG (Ctrl+C pour quitter)..."
case "$FILTER" in
  error)  adb -s $DEV shell "tail -f $LOG" | grep -v FOLLOW | grep -iE "error|fatal|csp|violates|uncaught|431|too long" ;;
  loop)   adb -s $DEV shell "tail -f $LOG" | grep -v FOLLOW | grep -iE "loop|resync|reload|post.srf|saut|v4.0" ;;
  page)   adb -s $DEV shell "tail -f $LOG" | grep -v FOLLOW | grep -iE "Page loaded|SPA navigation" ;;
  cookie) adb -s $DEV shell "tail -f $LOG" | grep -v FOLLOW | grep -iE "cookie|token|restaur|sauvegard" ;;
  *)      adb -s $DEV shell "tail -f $LOG" | grep -v FOLLOW ;;
esac
