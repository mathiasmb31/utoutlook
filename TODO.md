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

## Fait (v3.2.9 — suppression notification test "utoutlook-test" au démarrage)

- [x] Fix: common.sh — `utoutlook_wait_notifications` n'envoie plus de notification visible "utoutlook-test", remplacé par sonde silencieuse `notify --badge 0`
- [x] Fix: command.sh — message de bienvenue `shell.welcome` restauré (ce n'était pas lui le problème)
- [x] Tests: test #34 restauré (welcome présent), nouveau test pour sonde badge silencieuse
- [x] Version bump: 3.2.8 → 3.2.9

## Fait (v3.3.0 — look & feel Ubuntu Touch + texte liste agrandi)

- [x] main.css: section 9 — Police Ubuntu, couleur accent orange #E95420, bords arrondis 8-12px (cartes, boutons, inputs), sidebar fond gris foncé #2C2C2C, items sidebar blancs avec sélection orange, ombres subtiles, header bar arrondi
- [x] main.css: section 10 — Taille texte liste messages agrandie (sujet 1.05em/gras, expéditeur 1.0em, aperçu 0.95em, date 0.9em), hauteur items 72px min, padding vertical 10px
- [x] Version bump: 3.2.9 → 3.3.0

## Fait (v3.3.1 — réduction taille du click : 123 Mo → 108 Mo)

- [x] build/afterPack.mjs (nouveau) — nettoyage post-build Electron :
  supprime LICENSES.chromium.html (20 Mo), libvk_swiftshader.so (17 Mo),
  libvulkan.so.1 (2.5 Mo), chrome_crashpad_handler (1.8 Mo), chrome-sandbox,
  et nettoie locales/ (garde seulement fr.pak + en-US.pak, -8.5 Mo)
- [x] package.json — compression: "maximum" + files[] (exclut tests, .md, .ts des node_modules)
- [x] clickable.yaml — nettoyage utils/ avant copie : supprime shutil (8.2 Mo PostScript),
  zlib/ sources (6.5 Mo), xdg-open/ sources, .c, todo, cut.sh.sample
- [x] Résultat : unpacked 290→241 Mo, tar.gz arm64 116→104 Mo, click 123→108 Mo
- [x] Version bump: 3.3.0 → 3.3.1

## Fait (v3.3.2 — re-packaging xz du click : 108 Mo → 77 Mo)

- [x] repack-click-xz.sh (nouveau) — re-compresse le data.tar du .click en xz (-28%)
- [x] build-and-install.sh (nouveau) — workflow complet : clickable build + repack xz + install
- [x] compiledeps.sh — suppression copie xdotool, xev, xprop (inutiles sur UT, -400 Ko)
- [x] clickable.yaml — copie sélective de utils/ (exclut shutil 8.2 Mo, zlib/ 6.5 Mo,
      xdg-open/ sources, .c, todo) au lieu de rm sur les sources
- [x] Cumul total : 123 Mo (v3.3.0) → 77 Mo (v3.3.2), soit -37%
- [x] Version bump: 3.3.1 → 3.3.2

## Fait (v3.3.3 — fix scroll pull-down bloqué + démarrage intermittent)

- [x] Fix: gestures.js — pull-to-refresh teste désormais le vrai conteneur scrollable
      (findScrollContainer) au lieu de window.scrollY (toujours 0 dans la SPA Outlook) ;
      preventDefault() uniquement si le conteneur est à scrollTop <= 0. Le slide vers le
      bas fait enfin défiler la liste ; la barre bleue n'apparaît qu'en haut de liste.
- [x] Fix: command.sh — test_net non bloquant : 3 sondes nc de 2s (google.com, 1.1.1.1,
      outlook.office.com), et si tout échoue on lance quand même l'app (l'overlay hors
      ligne + moniteur de connectivité Electron gèrent la reconnexion). Avant : quittait
      l'app au démarrage si le réseau n'était pas prêt (1 fois sur 2-3).
- [x] Fix: command.sh — verify_prospect_life : rm du fichier heartbeat `follow` au
      démarrage + fenêtre de grâce de 60s si le heartbeat n'est pas encore écrit
      (cold start Electron lent) ; sinon la valeur stale de la session précédente
      provoquait une fausse stagnation → sortie sans relance.
- [x] Version bump: 3.3.2 → 3.3.3 (package.json + manifest.json)
- [x] Tests: 76 tests, 71 pass + 5 skip (Electron), 0 fail

## Fait (v3.3.4 — fix "l'app ne démarre pas" quand la fenêtre est cachée)

- [x] Diagnostic: aucun settings.json persisted → les defaults s'appliquaient :
      showWindowFrame=true (croix X11) + hideOnClose=true. Fermer par la croix
      cachait la fenêtre (hide) sans tuer le process ; au tap suivant sur
      l'icône, Lomiri « raise » une fenêtre cachée = rien ne s'affiche.
      Process + heartbeat vivants, écran inchangé → « ne démarre pas » 1 fois sur 2-3.
- [x] Fix: settings defaults → showWindowFrame/hideOnClose/hideOnMinimize = false
      (comportement app UT natif : plein écran, fermer = quitter proprement,
      le prochain tap relance un process neuf)
- [x] Fix: main.mjs — app.requestSingleInstanceLock() (le handler second-instance
      était du code mort sans le lock) ; second-instance → show() la fenêtre
- [x] Fix: main.mjs — heartbeat track la fenêtre PRINCIPALE (pas le splash) :
      si jamais visible après 30 heartbeats (~60s), force show() au lieu
      d'attendre 120s puis auto-exit → plus d'« app vivante mais invisible »
- [x] Logs: événements fenêtre show/hide/focus/blur/close/minimize, création
      splash (erreur si splash.html absent de l'asar), closeSplashWindow
- [x] Tests: +2 tests (80 tests, 75 pass + 5 skip, 0 fail)
- [x] Version bump: 3.3.3 → 3.3.4

## Fait (v3.3.5 — vraie cause du crash de lancement intermittent, attrapée en flagrant délit)

- [x] Diagnostic (logs 14:52 pendant l'upgrade 3.3.3→3.3.4) : l'ancien wrapper
      command.sh (PID 10171) est resté vivant après le `kill: prospect-mail` de
      clickable (orphan) et a écrit « tried too more » dans le flag `close` ;
      le NOUVEAU process Electron lit ce flag dans son heartbeat → app.exit(0)
      2s après le lancement. Race → « ne démarre pas » 1 fois sur 2-3.
      (vu aussi: bin/sleep/touch manquants pendant la transition → boucle folle)
- [x] Fix: main.mjs — PROCESS_START au boot + unlink du flag close au boot ;
      le heartbeat n'honore le flag close que si mtime > PROCESS_START
- [x] Fix: common.sh — utoutlook_kill_stale_wrappers() tue les wrappers
      command.sh orphelins d'anciennes versions (jamais $$/$PPID), appelé
      depuis cleanup de command.sh
- [x] Fix: command.sh — verify_prospect_life exige 2 stagnations consécutives
      (stagnantCount) avant d'écrire « tried too more »
- [x] Fix: command.sh — sleep_int retombe sur /bin/sleep si le binaire embarqué
      est absent (transition de version)
- [x] Tests: +2 (82 tests, 77 pass + 5 skip, 0 fail)
- [x] Version bump: 3.3.4 → 3.3.5
- [x] Fix: requestSingleInstanceLock best-effort seulement — sur UT, AppArmor bloque
      le dossier socket du singleton (« Failed to create socket directory »), le lock
      retournait false et app.exit(0) tuait CHAQUE lancement. Ne jamais quitter là-dessus.
- [x] Fix: pattern pgrep des wrappers orphelins match aussi la cmdline relative
      « /bin/bash ./bin/command.sh » (l'orphelin survivait sinon et tuait le nouveau
      process en boucle via pkill prospect-mail)
- [x] Fix: command.sh — lecture propre de numberold (follow absent = OK)
- [x] Testé sur téléphone: 3 cycles lancement/arrêt OK (procs actifs, heartbeat vivant,
      « Main window became visible after 2 heartbeats », lock « unavailable (continuing anyway) »)

## Fait (v3.3.8 — VRAIE cause racine du crash intermittent de lancement : FATAL GPU)

- [x] Diagnostic (log 16:08:44) : « GPU process launch failed: error_code=1002 » ×3
      puis « FATAL: GPU process isn't usable. Goodbye. » → tout le process Electron
      mourait. Intermittent (spawn du process GPU échoue selon mémoire/timing).
- [x] Cause : gpuoptions = --disable-gpu --disable-gpu-compositing
      --disable-software-rasterizer, et libvk_swiftshader.so stripé du package
      (v3.3.1) → aucun fallback GPU ; Chromium lançait quand même son process GPU
      séparé et FATALisait après 3 échecs de spawn.
- [x] Fix: gpuoptions = --in-process-gpu --disable-features=VaapiVideoDecoder,AcceleratedVideoDecoder
      (plus de process GPU séparé à spawner → le FATAL ne peut plus arriver)
- [x] Confirmé: pgrep -f embarqué ne voit RIEN sous confinement AppArmor
      (« pgrep fallback found: none ») → pidfile wrapper.pid est le mécanisme fiable
- [x] Tests: +1 (84 tests, 80 pass + 5 skip, 0 fail)
- [x] Testé sur téléphone: 3 cycles lancement/arrêt/relance, 0 erreur GPU/FATAL,
      fenêtre visible à chaque fois
- [x] Version bump: 3.3.7 → 3.3.8

## Fait (v3.3.9 + v3.3.10 — relance après nettoyage + upgrade cross-version propre)

- [x] v3.3.9: verify_prospect_life ne quitte plus après « ****** / Nettoyage » :
      il relance via launch_prospect (limite launchtry>3), launchtry retombe à 1
      quand le client est vivant. Testé: crash forcé → « cleaning and relaunching
      (try 1) » → « client is alive » 7s plus tard.
- [x] v3.3.10: à l'upgrade, l'ancien service systemd restait actif (deux wrappers
      qui se battent) car AppArmor bloque les signaux cross-label. Fix:
      utoutlook_kill_app pose un flag close FRAIS (l'ancien process le voit dans
      son heartbeat et sort gracieusement) ; et chaque wrapper sort si
      wrapper.pid appartient à un wrapper plus récent (ownership).
- [x] Tests: 86 tests, 82 pass + 5 skip, 0 fail
- [x] Version bump: 3.3.8 → 3.3.10

## Fait (v3.3.11 — « compte que vous pouvez utiliser ici » : domaine cloud.microsoft)

- [x] Diagnostic: au démarrage, outlook.office.com redirige vers
      outlook.cloud.microsoft/mail puis vers login.microsoftonline.com
      ?prompt=select_account si la session n'y est pas reconnue — et
      cloud.microsoft n'était présent NULLE PART dans le code.
- [x] Fix: CSP — `https://*.cloud.microsoft` dans les 6 directives + `wss://*.cloud.microsoft`
- [x] Fix: syncCookiesToLiveCom — copie aussi vers `.cloud.microsoft` / `outlook.cloud.microsoft`
- [x] Fix: settings — urlsExternal += outlook.cloud.microsoft,
      urlsInternal += outlook.cloud.microsoft/mail|calendar/deeplink
- [x] Fix: will-navigate — login_hint intercept aussi sur cloud.microsoft
- [x] Fix: will-navigate — `prompt=select_account` → `prompt=none` (reconnexion
      silencieuse, borné à 2 réécritures) quand on a des cookies de session
- [x] Fix: loop detector compte aussi les pages outlook.cloud.microsoft/mail
- [x] Tests: +3 (89 tests, 85 pass + 5 skip, 0 fail)
- [x] Version bump: 3.3.10 → 3.3.11

## Idées en réserve (non prioritaires)

- [ ] Raccourcis clavier personnalisables
- [ ] Support des pièces jointes hors-ligne (cache local)
- [ ] Recherche globale dans les mails (indexation locale)
- [ ] Sons de notification personnalisables
- [ ] Widget bureau (unread count sur l'écran d'accueil UT)
- [ ] Mise à jour auto du click (OTA)
