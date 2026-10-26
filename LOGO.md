# Logo — convention « Vibe coded / Human Tested / Human verified »

Ce projet suit la **convention logo transverse** :
`../base-de-connaissances/convention-logo-vibe.md`

En résumé :

- L'icône installée (`Icon=assets/logo.png` dans `utoutlook.desktop`) doit être la
  version **badge vibe** 512×512 avec le texte circulaire
  « VIBE CODED • HUMAN TESTED • HUMAN VERIFIED • », rendue depuis `logo-vibe.svg`
- Rendu **librsvg** (`convert -density 150 ... -resize 512x512`), jamais Inkscape
- Fichiers attendus dans `utoulookmail/assets/` : `logo.svg` · `logo-simple.svg` ·
  `logo-vibe.svg` · `logo.png` (vibe, 512) · `logo-vibe.png` (512) · `logo-simple.png` (512)
- Vérification : `../base-de-connaissances/scripts/verif-logo.sh utoulookmail/assets/logo.png 310 28`

**État : conforme avec déviation délibérée** — `assets/logo-vibe.svg` /
`assets/logo-vibe.png` (référence originale du style, 801×801) sont conservés pour
l'écran de démarrage et la page À propos. L'icône du lanceur
(`assets/logo.png` = `assets/logo-simple.png`) est volontairement **sans texte
circulaire** : hotfix #3 (v3.2.2) a constaté que le texte « HUMAN MADE • VIBE
VERIFIED » à font-size 28 était illisible à taille d'icône (~2 px), et hotfix #5
a remplacé le petit « O » par un grand « O » blanc lisible (style Outlook).

Si le texte circulaire revient un jour sur l'icône installée : suivre la
convention (une seule répétition, font-size nominal ~74, rendu librsvg 512×512,
vérification `verif-logo.sh`), puis bump de version.
