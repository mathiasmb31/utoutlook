#!/bin/bash
# check-history.sh — contrôle de confidentialité de l'historique git.
# v4.1.0: check.sh ne vérifie que l'arbre de travail ; un commit/PR publie
# aussi les auteurs et messages de TOUS les commits poussés.
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
STRICT=0
[ "${1:-}" = "--strict" ] && STRICT=1

# Le motif est construit morceau par morceau pour ne pas l'écrire en dur ici.
PAT="bre""thou"
COUNT=$(git log --all --format='%ae %ce %B' 2>/dev/null | grep -ic "$PAT" || true)
if [ "${COUNT:-0}" -gt 0 ]; then
  echo "HISTORIQUE NON CONFORME: ${COUNT} occurrence(s) de l'identité personnelle proscrite"
  echo "  Un revert ne suffit pas — réécriture d'historique + force-push coordonnés."
  [ "${STRICT}" -eq 1 ] && exit 1
  exit 0
fi
echo "historique conforme (0 occurrence)"
exit 0
