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

## Fait (v3.2.2 — hotfix #8 fausses notifications enveloppe)

- [x] Fix: état observer persistant dans window.__utoutlookState (survit aux re-injections)
- [x] Fix: skip checkUnread quand le title inbox est absent (garde re-render SPA)
- [x] Tests: 2 nouveaux tests (59 total, 54 pass + 5 skip Electron)

## Fait (v3.2.2 — hotfix #9 élément inbox périmé, fausses notifications)

- [x] Fix: inboxElement const → let, re-querié à chaque checkUnread (la SPA Outlook recrée le nœud DOM à la navigation)
- [x] Fix: garde document.contains() — ignorer un élément déconnecté du DOM (titre périmé = faux compte non lus)
- [x] Fix: zeroUnreadConfirmCount — 2 lectures nulles consécutives requises avant d'accepter une chute à 0
- [x] (pas de nouveaux tests — fix ciblé sur unread-number-observer.js)

## Fait (v3.2.2 — hotfix #10 debounce badge + trace sources de notification)

- [x] Trace: console.log('[UTOUTLOOK NOTIF]') dans showNotification() + logger.info('[NOTIFICATION] …') dans handleNotification()
- [x] Fix: updateUnreadDebounced() — badge différé de 2 s (anti-scintillement pendant les re-renders SPA)
- [x] Fix: ignorer updateUnread(0) tant que le zéro n'est pas confirmé
- [x] (pas de nouveaux tests — fix ciblé observer + contrôleur)

## Fait (v3.2.2 — hotfix #11 régression notif nouveau mail)

- [x] Fix: checkUnread — capturer `previousUnreadCount` AVANT la mise à jour de `lastUnreadCount` (le hotfix #9 mettait à jour avant la comparaison → `unread > lastUnreadCount` était toujours faux → aucune notification de nouveau mail)
- [x] Fix: comparaison notification `unread > previousUnreadCount` (au lieu de `state.lastUnreadCount`, déjà mis à jour)
- [x] Fix: `zeroUnreadConfirmCount` s'appuie aussi sur `previousUnreadCount`
- [x] Tests: 1 nouveau test (60 total, 55 pass + 5 skip Electron)
- [x] Vérifié sur téléphone : fix présent dans l'asar, livraison `com.lomiri.Postal.Post` OK (`[POST SUCCESS]`)

## Fait (v3.2.2 — hotfix #12 heartbeat auto-exit + badge launcher)

- [x] Fix: heartbeat auto-exit ne tue plus l'app en arrière-plan — `windowEverVisible` garde une trace si la fenêtre a déjà été affichée ; une fois visible, l'app reste en vie pour les notifications (hotfix #12)
- [x] Fix: `setBadgeCount()` utilise `com.lomiri.Postal.SetCounter` au lieu de `com.lomiri.LauncherEntry.Update` (inexistant sur UT 24.04) — le badge launcher fonctionne
- [x] Fix: suppression des appels `updateCount()` dans le constructeur et `send()` de PushClient — ils réinitialisaient le badge à 0 à chaque notification
- [x] Fix: suppression de `makeLauncherPath` (LauncherEntry plus utilisé)
- [x] Tests: 3 nouveaux tests (63 total, 58 pass + 5 skip Electron)
- [x] Click 3.2.2 rebuildé et installé sur téléphone (27/10 18:47) — heartbeat vérifié actif

## Fait (v3.2.2 — hotfix #13 + #14 suppression notif foreground + faux reloads)

- [x] Fix: show-notification IPC supprimé quand fenêtre visible+focusée (hotfix #13) — évite la bannière Lomiri quand l'utilisateur regarde déjà l'app
- [x] Fix: badge continue de se mettre à jour normalement (canal updateUnread séparé)
- [x] Fix: did-fail-load offline detection filtré sur isMainFrame=true (hotfix #14) — une image/XHR qui échoue ne déclenche plus l'overlay offline
- [x] Fix: connectivity monitor ne fait plus win.reload() (hotfix #14) — retire juste l'overlay, la SPA Outlook se reconnecte seule (élimine le flash: bande bleue → reload → splash enveloppe → retour)
- [x] Tests: 3 nouveaux tests (66 total, 61 pass + 5 skip Electron)
- [x] Click 3.2.2 rebuildé et installé sur téléphone (27/10 19:07) — heartbeat vérifié actif

## Fait (v3.2.3 — hotfix #15 splash lifecycle + notif bienvenue)

- [x] Fix: command.sh — export XDG_RUNTIME_DIR + DBUS_SESSION_BUS_ADDRESS (sécurité, Lomiri les fournit déjà)
- [x] Fix: splash ne se ferme plus au premier dom-ready (redirects Outlook) — reste ouvert jusqu'à l'interface mail réelle ou page login
- [x] Fix: did-finish-load ferme le splash quand URL = mail interface (`isMailInterfaceUrl`) ou login (`isLoginPageUrl`)
- [x] Fix: closeSplashWindow idempotent (flag `splashClosed`) + affiche la fenêtre principale à la fermeture du splash
- [x] Fix: pas de barre de progression bleue tant que le splash est ouvert (`did-start-loading` skip si `!splashClosed`)
- [x] Fix: timeout splash augmenté 15s → 30s (connexions mobiles lentes)
- [x] **Fix CRITIQUE: notify binary — suppression du champ `actions` dans buildNotification** — le champ `actions` faisait échouer le parsing Postal → pas de popup (pas de `Notify` sur org.freedesktop.Notifications). Vérifié sur device avec dbus-monitor.
- [x] Tests: 9 nouveaux tests (75 total, 70 pass + 5 skip Electron)
- [x] Click 3.2.3 rebuildé et installé — notif bienvenue + splash lifecycle vérifiés sur téléphone

## Fait (v3.2.4 — hotfix #16 cache enveloppe pull-to-refresh)

- [x] Fix: main.css — règles CSS pour cacher l'indicateur pull-to-refresh d'Outlook (enveloppe au pull-down) : sélecteurs `pullToRefresh`, `refreshIndicator`, `refreshControl`, `overscrollIndicator`
- [x] Fix: main.css — cache l'indicateur de chargement en bas de liste (spinner/enveloppe au scroll-down) : `listLoading`, `loadingMore`, `ProgressRing` dans `messageList`/`listView`
- [x] Fix: main.css — `overscroll-behavior-y: contain` sur les conteneurs de liste + `none` sur html/body (anti-bounce)
- [x] Fix: gestures.js — `e.preventDefault()` systématique au pull-down (dès le 1er pixel, plus de seuil à 0.3) pour bloquer l'enveloppe Outlook
- [x] Fix: gestures.js — injection style inline `overscroll-behavior-y: none` en fallback du CSS insertCSS
- [x] Fix: clickable.yaml — glob arm64 tar.gz matchait 2 fichiers (3.2.3 + 3.2.4) → `ls -t | head -1`
- [x] Click 3.2.4 buildé et installé sur téléphone (28/10 20:11) — app lancée et fonctionnelle (prospect-mail PID 87876)

## Fait (v3.2.5 — hotfix #17 cache TOUS les cas d'enveloppe bleue Outlook)

- [x] Fix: main.css — +225 lignes, 8 blocs de sélecteurs agressifs :
  - Sélecteurs sémantiques ARIA (`role="progressbar"`, `aria-busy="true"`, `aria-label*="loading/chargement/refresh"`)
  - `data-automation-id` (spinner, loading, progress, refresh, pull, sync)
  - Classes Fluent UI (`fui-Spinner`, `fui-ProgressIndicator`, `fui-ProgressRing`, `ms-Spinner`)
  - Enfants directs des conteneurs de liste (wrappers pull/refresh/indicator)
  - Skeleton/shimmer/overlay/backdrop
- [x] Fix: gestures.js — MutationObserver JS : surveille les conteneurs de liste, cache dynamiquement tout indicateur de chargement apparaissant après le chargement initial (SPA Outlook recrée les nœuds DOM)
- [x] Fix: gestures.js — Réapplication périodique (3s) anti-régression SPA
- [x] Version bump: 3.2.4 → 3.2.5

## Fait (v3.2.6 — hotfix #18 supprime le reload() du pull-to-refresh)

- [x] **Fix CRITIQUE**: gestures.js — suppression du `window.location.reload()` dans le pull-to-refresh → c'était LUI qui déclenchait le splash Outlook (enveloppe bleue plein écran qui tourne)
- [x] Le pull-to-refresh est maintenant purement visuel (barre bleue) sans recharger la page
- [x] Version bump: 3.2.5 → 3.2.6
- [x] Installé et lancé sur FP4 (28/10 21:28) — prospect-mail PID 140841

## Fait (v3.2.7-3.2.8 — fix notifications nouveau mail + i18n sujet)

- [x] Fix: command.sh — suppression du message de bienvenue au démarrage (demande utilisateur)
- [x] Fix: unread-number-observer.js — sélecteurs alternatifs pour trouver l'inbox (Outlook a changé son DOM, `[data-folder-name="inbox"]` ne fonctionnait plus)
- [x] Fix: unread-number-observer.js — debug: true + logs de connexion explicites
- [x] Fix: unread-number-observer.js — extraction du sujet + expéditeur du dernier mail (`getLatestMailInfo()`)
- [x] Fix: notifications i18n — nouvelles clés `notif.newMail.title/body/bodyNoSubject` (8 langues)
- [x] Fix: notification enrichie — "Nouveau mail — {sender}: {subject}" au lieu de "X messages non lus"
- [x] Version bump: 3.2.6 → 3.2.8

## Idées en réserve (non prioritaires)

- [ ] Raccourcis clavier personnalisables
- [ ] Support des pièces jointes hors-ligne (cache local)
- [ ] Recherche globale dans les mails (indexation locale)
- [ ] Sons de notification personnalisables
- [ ] Widget bureau (unread count sur l'écran d'accueil UT)
- [ ] Mise à jour auto du click (OTA)
