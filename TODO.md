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
- [x] i18n — 8 langues (FR/EN/ES/DE/IT/PT/ZH/AR) : tray menu, dialogs, notifications, offline, splash, about, shell scripts

## Fait (v3.2.2 — fixes session + notifications)

- [x] Fix: persistance session — flush cookies toutes les 15s (évite perte de session au kill)
- [x] Fix: arrêt gracieux — SIGTERM avant SIGKILL dans utoutlook_kill_app (common.sh)
- [x] Fix: flush cookies de toutes les partitions à la fermeture (cleanupAndExit)
- [x] Fix: notifications au démarrage — observer retry continu avec backoff exponentiel (3s→30s max)
- [x] Fix: observer health check — réinjection auto si déconnecté (toutes les 10s)
- [x] Fix: réinjection observer sur did-stop-loading (SPA lente)
- [x] Fix: cleanup observer avant réinjection (évite les doublons)
- [x] Tests: 8 nouveaux tests (30 total, 25 pass + 5 skip Electron)

## Fait (v3.2.2 — fix notifs scripts shell)

- [x] Fix: notify binary — return exit code 1 si D-Bus échoue (main.cpp)
- [x] Fix: notify binary — timeout D-Bus 5s au lieu de 25s (pushclient.cpp)
- [x] Fix: utoutlook_notify — retry 3x avec délai 2s (common.sh)
- [x] Fix: utoutlook_wait_notifications — attente service notif (15s max)
- [x] Fix: command.sh — remplacer appels directs notify par utoutlook_notify
- [x] Fix: command.sh — attendre notif service avant welcome
- [x] Fix: reset_zoom.sh — utiliser utoutlook_notify
- [x] Tests: 7 nouveaux tests (37 total, 32 pass + 5 skip Electron)

## Fait (v3.2.2 — hotfix écran d'erreur au démarrage)

- [x] Fix: faux positif overlay "Pas de connexion" — ERR_ABORTED (-3) retiré de networkErrors (SPA Outlook)
- [x] Fix: unhandled Promise rejections — addUnreadNumberObserver() async + try-catch executeJavaScript
- [x] Fix: health check — vérifie document.readyState avant réinjection
- [x] Fix: .catch() sur tous les executeJavaScript (dom-ready, did-navigate-in-page, did-stop-loading)
- [x] Fix: injectGestures() — .catch() sur le Promise executeJavaScript
- [x] Fix: AppArmor — /usr/bin/touch embarqué dans le click (clickable.yaml)
- [x] Tests: 4 nouveaux tests (41 total, 36 pass + 5 skip Electron)

## Fait (v3.2.2 — hotfix #7c boucle infinie comptes personnels)

- [x] Fix: syncCookiesToLiveCom() — copie cookies office.com → live.com avec SameSite=None
- [x] Fix: will-navigate login_hint — synchronise cookies avant chargement (garde login_hint)
- [x] Fix: détecteur boucle — sync cookies au lieu de clear session + retry max 3
- [x] Fix: did-finish-load — sync cookies early quand #code= détecté (auth code)
- [x] Fix: CSP — ajout *.live.net dans toutes les directives
- [x] Tests: 5 nouveaux tests (57 total, 52 pass + 5 skip Electron)

## Idées en réserve (non prioritaires)

- [ ] Raccourcis clavier personnalisables
- [ ] Support des pièces jointes hors-ligne (cache local)
- [ ] Recherche globale dans les mails (indexation locale)
- [ ] Sons de notification personnalisables
- [ ] Widget bureau (unread count sur l'écran d'accueil UT)
- [ ] Mise à jour auto du click (OTA)
