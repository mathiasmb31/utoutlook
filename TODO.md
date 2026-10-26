# TODO

## Demain — Revue de code

- [x] Relire tout le code (Electron + shell + C++ + CSS)
- [x] Proposer d'autres améliorations
- [x] Implémenter les améliorations retenues

## Fait (v3.2.0)

- [x] Mode lecture concentrée (focus mode) — toggle tray + raccourci Ctrl+Shift+F
- [x] Export/import des paramètres (JSON)
- [x] Couleur d'accent custom (7 presets dans le menu tray)
- [x] Dark mode amélioré (nav pane, cards, inputs, links, dividers)
- [x] Cleanup imports inutilisés (ZOOM_TRIGGER_GLOB, TEXT_TRIGGER_GLOB, ZOOM_RESET_FILE)

## Fait (v3.2.1 — en cours)

- [x] Mode sombre manuel (toggle indépendant du système) — 3 états: auto/on/off, menu tray + Ctrl+Shift+D
- [x] Fix: script npm test (node --test test/ → node --test)
- [x] Fix: preload.js — ajout de reload() manquant (référencé par offline.html)
- [x] Tests: ajout tests validation darkMode
- [x] Logo "Human made, vibe verified" — texte rotatif autour du cercle sur splash + about

## Idées en réserve (non prioritaires)

- [ ] Raccourcis clavier personnalisables
- [ ] Support des pièces jointes hors-ligne (cache local)
- [ ] Recherche globale dans les mails (indexation locale)
- [ ] Sons de notification personnalisables
- [ ] Widget bureau (unread count sur l'écran d'accueil UT)
- [ ] Mise à jour auto du click (OTA)
