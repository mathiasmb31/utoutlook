import path from 'node:path';
import {app, BrowserWindow, globalShortcut, session} from 'electron';
import AccountManager from './account-manager.mjs';
import {TrayController} from './controller/tray-controller.mjs';
import {startSocketServer, stopSocketServer} from './ipc-socket.mjs';
import {logger} from './logger.mjs';
import {setLanguage, t} from './i18n.mjs';
import {execFile, execFileSync} from 'node:child_process';
import {resolveLanguage, writeLangFile, settings} from './settings.mjs';
import {
    CONFIG_DIR,
    HEARTBEAT_FILE,
    EXIT_CLIENT_FILE,
    KILLED_CLIENT_FILE,
    CLOSE_FLAG_FILE,
    FORCE_QUIT_FILE,
    SWIPE_HIDDEN_FILE,
    markCleanExit,
} from './config.mjs';
import fs from 'node:fs';

// v3.3.77: augmente la pile JS de V8 — la page de login Microsoft (Knockout) fait
// des bindings récursifs profonds qui dépassent la pile par défaut dans Chromium
// embarqué → « Maximum call stack size exceeded » en boucle sur « Trying to sign
// you in… ». --stack-size est en Ko (défaut ~984).
app.commandLine.appendSwitch('js-flags', '--stack-size=4000');

// ============================================================
// Global error handlers — prevent silent crashes
// ============================================================
// v3.3.22: a single uncaughtException used to app.exit(1) immediately — one stray
// error killed the whole app (crash.log showed repeated setProgressBar/webContents
// of null). Now: log + crash.log always, exit only after 5 errors in 60s.
let uncaughtCount = 0;
let uncaughtWindowStart = Date.now();
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    fs.writeFile(`${CONFIG_DIR}/crash.log`,
        `${new Date().toISOString()} [uncaughtException] ${err.stack}\n`, {flag: 'a'},
        () => {}
    );
    const now = Date.now();
    if (now - uncaughtWindowStart > 60000) { uncaughtCount = 0; uncaughtWindowStart = now; }
    uncaughtCount++;
    if (uncaughtCount >= 5) {
        logger.error('5 uncaught exceptions in 60s — exiting');
        // v4.1.0 (revue E26): poser le flag, sinon le wrapper relance en boucle.
        try { markCleanExit(); } catch (e) { /* ignore */ }
        app.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    fs.writeFile(`${CONFIG_DIR}/crash.log`,
        `${new Date().toISOString()} [unhandledRejection] ${reason}\n`, {flag: 'a'},
        () => {}
    );
});

// Ensure config directory exists
fs.mkdirSync(CONFIG_DIR, {recursive: true});

// v3.3.5: process start time — used to ignore stale lifecycle flag files left
// by a PREVIOUS instance's shell wrapper. An orphaned command.sh from an old
// version used to write "tried too more" into the close flag while the new
// process was starting; the heartbeat then read it and called app.exit(0)
// 2s after launch ("app does not start", ~1 launch in 2-3, race-dependent).
const PROCESS_START = Date.now();
try { fs.unlinkSync(CLOSE_FLAG_FILE); } catch (e) { /* ignore */ }
// v4.1.0 (revue A4): ne PAS supprimer wrapper-quit ici — un nouveau process
// démarrant pendant qu'un wrapper écrit le flag effacerait le signal et
// l'ancien process masquerait sa fenêtre puis finirait SIGKILL (orphelins).
// La fraîcheur est déjà vérifiée sur SIGTERM (mtime >= PROCESS_START).

// v3.3.28: markCleanExit() lives in config.mjs (shared with the window
// controller) — it writes the exitclient flag SYNCHRONOUSLY before every
// deliberate quit so the shell wrapper does not relaunch the app after a
// swipe-close (see config.mjs).

// Heartbeat: write a counter to a file so the shell wrapper (command.sh) can
// detect whether the Electron process is still alive.
let heartbeatSeconds = 0;
let heartbeatExiting = false;
// hotfix #12: remember whether the window has ever been shown. The heartbeat
// auto-exit is only a startup-failure safety net (the window never appears).
// Once the window has been visible at least once, the app must keep running in
// the background (screen off / app backgrounded) so new-mail notifications keep
// being delivered. hideOnClose/hideOnMinimize hide the window on background,
// which makes isVisible() false — that must NOT kill the app anymore.
let windowEverVisible = false;
// v3.3.4: track the MAIN window separately from the splash. If the main window
// has never been shown ~60s after start (missed did-finish-load / splash edge
// case), force show() — otherwise the app runs with an invisible window and
// looks like it "does not start" while the process and heartbeat are alive.
let mainWindowEverVisible = false;
let appInstance = null;

// v4.2.8: message utilisateur APRÈS 10 s seulement si la fenêtre principale
// n'est toujours pas visible — sur device, l'app peut mettre du temps à
// apparaître et l'utilisateur se demande ce qui se passe. Pas de notification
// sur les démarrages rapides. Notification shell via le binaire embarqué
// (jamais de fenêtre QML : elle recréerait l'item unknown.qtmir / icône jaune).
setTimeout(() => {
    if (!process.env.WD) return;
    // v4.2.9: NE PAS se fier à mainWindowEverVisible — sur device il peut
    // passer à true alors que Lomiri n'a aucune session Mir (journal 20/11
    // 10:18). On vérifie la fenêtre RÉELLE : visible ET focalisée. Si elle
    // n'est pas focalisée, la surface n'est pas réellement affichée.
    const win = appInstance?.mailController?.win;
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return;
    try {
        execFile(`${process.env.WD}/bin/notify`, [t('shell.welcome')], () => {});
    } catch (e) { /* ignore */ }
}, 10000).unref();

// v4.2.6: écrire un heartbeat SYNCHRONE dès le chargement du module. Sur device,
// l'intervalle de 2 s mettait parfois 30 s à produire son 1er tick (event loop
// bloquée par le chargement de l'asar / de la webapp) → le wrapper croyait
// "heartbeat not started yet" pendant 10×3 s et relançait l'app → splash bloqué
// une fois sur deux après fermeture. Un write synchrone immédiat garantit que
// le fichier existe avant même le premier tick.
try { fs.writeFileSync(HEARTBEAT_FILE, '0'); } catch (e) { /* ignore */ }

const heartbeatInterval = setInterval(() => {
    if (heartbeatExiting) return;
    heartbeatSeconds++;
    const content = heartbeatSeconds.toString();

    const visibleCount = BrowserWindow.getAllWindows()
        .filter(b => b.isVisible())
        .length;

    if (visibleCount > 0) {
        windowEverVisible = true;
    }

    const mainWin = appInstance?.mailController?.win;
    if (mainWin && !mainWin.isDestroyed() && mainWin.isVisible()) {
        if (!mainWindowEverVisible) {
            mainWindowEverVisible = true;
            logger.info(`Main window became visible after ${heartbeatSeconds} heartbeats`);
        }
    } else if (!mainWindowEverVisible && heartbeatSeconds === 30) {
        // v4.1.0 (revue D21): vérifier TOUS les comptes, pas seulement le
        // principal — un autre compte peut avoir une fenêtre visible.
        logger.warn('Main window never shown after 60s — forcing show()');
        for (const ctl of (appInstance?.accountManager?.controllers?.values() || [])) {
            try { ctl.show(); } catch (e) { logger.error('Force show failed:', e); }
        }
    }

    // After 60 heartbeats (~2 min) during which the window NEVER appeared,
    // signal exit and quit (startup failure: window never showed up).
    // 10s was too short — Outlook web app can take 30s+ to load on slow devices,
    // causing the app to kill itself before the window ever appears (crash
    // at startup ~1 in 2 launches depending on network speed).
    // Once the window has been shown at least once, NEVER auto-exit: keep the
    // app alive in the background (screen off / app backgrounded) so that
    // new-mail notifications keep being delivered.
    if (!windowEverVisible && heartbeatSeconds > 60) {
        // v3.3.28: startup-failure auto-exit must NOT write the exitclient
        // flag — that flag means "deliberate quit" to the wrapper. Here the
        // wrapper's own stagnation detection must relaunch the app instead.
        app.exit(0);
        return;
    }

    // Once the window has been shown, keep the counter cycling so command.sh's
    // watcher keeps seeing it change (a static counter = dead/frozen app).
    if (windowEverVisible && heartbeatSeconds > 60) {
        heartbeatSeconds = 0;
    }

    fs.writeFile(HEARTBEAT_FILE, content, err => {
        if (err) logger.error(err);
    });

    // Check for external close flag from the shell wrapper (fallback for socket).
    // v4.0.22: the close flag file is NO LONGER honored at all — it was the
    // source of repeated "slow splash then exit on relaunch" bugs (a flag
    // written by a dying old wrapper during a race could kill the new process).
    // The wrapper already stops the app cleanly via the Unix socket "quit"
    // command (utoutlook_send_socket_cmd), which is race-free. Just delete any
    // stale flag and move on.
    if (fs.existsSync(CLOSE_FLAG_FILE)) {
        try { fs.unlinkSync(CLOSE_FLAG_FILE); } catch (e) { /* ignore */ }
    }
}, 2000);

// Set the app name to use kebab-case for config directory (avoids spaces in path)
// This must be set before app is ready
app.setPath("userData", path.join(app.getPath("appData"), "prospect-mail"));

// v4.2.3: retour EXACT à l'état v4.0.98 (avant commit 8a40c2e / v4.1.0).
// `setDesktopName("utoutlook.mathias_utoutlook")` + `--class` + StartupWMClass
// ont introduit l'icône jaune `unknown.qtmir` et le blocage du lancement.
// whatslectron (autre app Electron, sans ces 3 réglages) n'a pas le problème.
app.setDesktopName("UToutlookmail");

//Store commandline for global purpose
global.cmdLine = process.argv;

class ProspectMail {
    constructor() {
        this.accountManager = null;
        this.trayController = null;
        this.isQuitting = false;
        // v4.0.125: garde-fou DISTINCT de isQuitting. Les handlers before-quit /
        // will-quit posent isQuitting avant d'appeler cleanupAndExit() — si
        // cleanupAndExit() utilise isQuitting comme garde, elle sortait
        // immédiatement et NE FAISAIT RIEN (plus de flag exitclient, heartbeat
        // toujours vivant, fenêtre masquée au lieu de fermée → app invisible).
        this.cleanupStarted = false;
        this.socketServer = null;
    }

    /**
     * Get the primary (active) account's MailWindowController.
     * Provides backward compatibility with code expecting a single controller.
     * @returns {MailWindowController|undefined}
     */
    get mailController() {
        return this.accountManager?.getPrimary();
    }

    // init method, the entry point of the app
    init() {
        // v3.3.5: do NOT hard-quit when requestSingleInstanceLock() returns false.
        // Under Ubuntu Touch AppArmor the singleton socket directory cannot be
        // created ("Failed to create socket directory"), so the lock always
        // fails here — quitting on it made EVERY launch exit immediately.
        // The lock is best-effort only: duplicate instances are already handled
        // by the shell wrapper (cleanup kills the old process + orphan wrappers).
        const gotLock = app.requestSingleInstanceLock();
        logger.info(`Single-instance lock: ${gotLock ? 'acquired' : 'unavailable (continuing anyway)'}`);
        // v4.0.18: log wrapper PID env so we can verify the close-flag guard works
        logger.info(`UTOUTLOOK_WRAPPER_PID=${process.env.UTOUTLOOK_WRAPPER_PID || '(unset)'} pid=${process.pid}`);
        app.on("second-instance", (_event, _argv, _cwd) => {
            logger.info('second-instance received — showing main window');
            const primary = this.mailController;
            if (primary) primary.show();
        });
        this.initApp();
    }

    // init the main app
    initApp() {
        app.on("ready", () => {
            // Initialize i18n language from settings
            const lang = resolveLanguage();
            setLanguage(lang);
            logger.info(`Language: ${lang}`);
            // v3.3.31: log the keyboard-relevant environment at startup — this is
            // how we confirm on-device that Chromium really runs on X11 (XWayland)
            // and not as a native Wayland client (which would ignore XMODIFIERS).
            logger.info(`env: DISPLAY=${process.env.DISPLAY || '(unset)'} WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY || '(unset)'} XDG_SESSION_TYPE=${process.env.XDG_SESSION_TYPE || '(unset)'} XMODIFIERS=${process.env.XMODIFIERS || '(unset)'} QT_IM_MODULE=${process.env.QT_IM_MODULE || '(unset)'}`);
            // Ensure lang file exists (re-write if deleted manually)
            writeLangFile();

            this.createControllers();
            this.startSocketServer();
            this.registerShortcuts();
        });

        app.on("browser-window-blur", () => {
            // v4.1.0 (revue A7): ne JAMAIS quitter sur un simple blur —
            // si hideOnClose est désactivé via le tray, ça coupait les
            // notifications en arrière-plan. Le wrapper/socket décide.
            logger.info('browser-window-blur — no auto-quit (v4.1.0)');
        });

        app.on("will-quit", (e) => {
            if (this.isQuitting) return;
            e.preventDefault();
            // v4.0.125: NE PAS poser isQuitting ici — cleanupAndExit() le pose.
            // Le poser avant l'appel faisait sortir cleanupAndExit() sur son
            // garde-fou (`if (this.isQuitting) return`) → quit annulé sans
            // exitclient, heartbeat vivant, fenêtre masquée (hideOnClose) →
            // « app vivante mais invisible » après le bouton Quitter.
            this.cleanupAndExit();
        });

        app.on("before-quit", (e) => {
            if (this.isQuitting) return;
            e.preventDefault();
            // v4.0.125: idem will-quit — laisser cleanupAndExit() poser le flag.
            this.cleanupAndExit();
        });

        // 'quit' is not preventable — just clean up
        app.on("quit", () => {
            global.utoutlookQuitting = true; // v4.0.125: cohérent avec cleanupAndExit
            heartbeatExiting = true;
            clearInterval(heartbeatInterval);
            globalShortcut.unregisterAll();
            stopSocketServer();
        });

        process.on("SIGINT", () => {
            this.cleanupAndExit();
        });

        process.on("SIGTERM", () => {
            // v4.1.0: deux SIGTERM très différents :
            //  - wrapper (utoutlook_kill_app) écrit wrapper-quit juste avant :
            //    on fait un VRAI quit propre. Le process reapera ses enfants
            //    Chromium → pas de zombies/orphelins, plus besoin de SIGKILL.
            //  - swipe-close Lomiri : pas de flag → on masque la fenêtre et on
            //    reste vivant pour les notifications (comportement v4.0.36).
            let wrapperQuit = false;
            try {
                if (fs.existsSync(FORCE_QUIT_FILE)) {
                    wrapperQuit = fs.statSync(FORCE_QUIT_FILE).mtimeMs >= PROCESS_START;
                }
            } catch (e) { /* flag illisible → traiter comme un swipe */ }
            if (wrapperQuit) {
                logger.info('SIGTERM from wrapper (wrapper-quit flag) — clean quit');
                this.cleanupAndExit();
                return;
            }
            logger.info('SIGTERM received — hiding window instead of exiting (UT swipe-close)');
            // v4.1.0: masquer TOUS les comptes, pas seulement le principal.
            for (const ctl of (this.accountManager?.controllers?.values() || [])) {
                if (ctl.win && !ctl.win.isDestroyed()) ctl.win.hide();
            }
        });

        app.on("window-all-closed", () => {
            // v3.3.28: sync write — the wrapper must see this flag to avoid
            // relaunching the app after a swipe-close (see markCleanExit).
            if (!global.restartRequested && !global.skipCleanExitFlag) markCleanExit();
            app.exit(0);
        });
    }

    startSocketServer() {
        this.socketServer = startSocketServer({
            onQuit: () => {
                logger.info("Socket: quit command received");
                this.cleanupAndExit();
            },
            onShow: () => {
                // v4.0.27: launcher tap while the app is already running (hidden
                // after swipe-close) — re-show the main window.
                logger.info("Socket: show command received");
                // v4.1.0: un tap sur le launcher annule le masquage swipe-close.
                try { fs.unlinkSync(SWIPE_HIDDEN_FILE); } catch (e) { /* ignore */ }
                if (this.mailController) {
                    this.mailController.show();
                    // v4.1.0: show() sur une fenêtre déjà "visible" ne fait rien
                    // côté Mir — forcer la réintégration de la surface.
                    this.mailController.resurfaceWindow(true);
                }
            },
            onZoom: (action) => {
                if (this.mailController) {
                    this.mailController.handleZoomCommand(action);
                }
            },
            onText: (text) => {
                if (this.mailController) {
                    this.mailController.insertText(text);
                }
            },
            onReload: () => {
                if (this.mailController) {
                    this.mailController.reloadWindow();
                }
            },
            onReadingFont: (action) => {
                if (this.mailController) {
                    this.mailController.handleReadingFontCommand(action);
                }
            },
            onEval: async (code) => {
                const mc = this.mailController;
                if (!mc || !mc.win || mc.win.isDestroyed()) return 'no window';
                const result = await mc.win.webContents.executeJavaScript(code);
                logger.info(`[EVAL] ${String(result).substring(0, 2000)}`);
                return result;
            },
        });
    }

    registerShortcuts() {
        // Global shortcuts (work even when app is not focused)
        try {
            globalShortcut.register('CommandOrControl+Shift+M', () => {
                if (this.mailController) this.mailController.show();
            });
            globalShortcut.register('CommandOrControl+Shift+R', () => {
                if (this.mailController) this.mailController.reloadWindow();
            });
            globalShortcut.register('CommandOrControl+Shift+F', () => {
                if (this.mailController) this.mailController.toggleFocusMode();
            });
            globalShortcut.register('CommandOrControl+Shift+D', () => {
                if (this.mailController) this.mailController.toggleDarkMode();
            });
            globalShortcut.register('CommandOrControl+Shift+Q', () => {
                this.cleanupAndExit();
            });
        } catch (err) {
            logger.warn("Could not register global shortcuts:", err.message);
        }
    }

    async cleanupAndExit() {
        // v4.0.125: garde sur cleanupStarted, PAS sur isQuitting — les handlers
        // before-quit/will-quit (et le socket quit) appellent cette méthode, et
        // isQuitting peut déjà être true sans que le nettoyage ait eu lieu.
        if (this.cleanupStarted) return;
        this.cleanupStarted = true;
        this.isQuitting = true;
        // v4.0.125: signal au contrôleur de fenêtre que c'est un VRAI quit :
        // son handler 'close' ne doit PAS intercepter hideOnClose (sinon la
        // fenêtre est masquée au lieu de se fermer et app.quit() est annulé).
        global.utoutlookQuitting = true;
        // v3.3.28: write the clean-quit flag FIRST, synchronously, before the
        // async cookie flushes below — a SIGKILL during the flush must not
        // lose the flag (the wrapper would relaunch a deliberately quit app).
        // Skipped when the quit is a restart (settings import/reset).
        // v4.0.84: skipCleanExitFlag = relance volontaire après rotation (le wrapper doit relancer l'app)
        if (!global.restartRequested && !global.skipCleanExitFlag) markCleanExit();
        // v4.3.3: envoyer "goodbye" IMMEDIATEMENT ici, pendant que l'app est
        // encore vivante. Le wrapper ne peut plus le faire : Lomiri le tue par
        // SIGKILL quelques secondes apres la fermeture de la fenetre, donc sa
        // notification partait trop tard (au lancement suivant).
        try {
            if (process.env.WD) {
                execFileSync(`${process.env.WD}/bin/notify`, [t('shell.goodbye')],
                    {timeout: 4000, stdio: 'ignore'});
            }
        } catch (e) { /* ignore */ }
        heartbeatExiting = true;
        clearInterval(heartbeatInterval);
        stopSocketServer();

        // Flush all session cookies to disk before exiting so the login
        // session survives app restarts (Chromium normally flushes every
        // ~30s, but we may be killed before that).
        // Await each flushStore() — without await, app.exit() races ahead
        // and the cookies never reach disk.
        try {
            const accounts = settings.get('accounts') || [];
            for (const acct of accounts) {
                if (acct.partition) {
                    try {
                        await session.fromPartition(acct.partition).cookies.flushStore();
                    } catch (e) { /* partition may not exist yet */ }
                }
            }
            // Also flush the default session
            try {
                await session.defaultSession.cookies.flushStore();
            } catch (e) { /* ignore */ }
        } catch (err) {
            logger.warn('Failed to flush session cookies on exit:', err.message);
        }

        // v3.3.28: clean-quit flag already written synchronously at the top
        // of cleanupAndExit (before the awaits). keptmail kept for compat.
        try { fs.writeFileSync(KILLED_CLIENT_FILE, 'quitclient'); } catch (e) { /* ignore */ }

        // v4.0.116: QUIT PROPRE au lieu de app.exit(0). L'arrêt brutal tuait
        // Electron sans laisser les fenêtres se fermer ni les sous-process
        // Chromium se récupérer (impression de "quit viol brutal"). app.quit()
        // déclenche before-quit → notre handler voit isQuitting=true et ne
        // réentre pas dans cleanupAndExit. Filet de sécurité : si Electron
        // bloque sur un beforeunload, on force après 3 s.
        const hardExitTimer = setTimeout(() => {
            logger.warn('Graceful quit took too long — forcing exit');
            app.exit(0);
        }, 3000);
        // v4.1.0 (revue A6): pas de unref() — le filet 3 s doit toujours tourner.
        // if (typeof hardExitTimer.unref === 'function') hardExitTimer.unref();
        app.quit();
    }

    createControllers() {
        this.accountManager = new AccountManager();
        this.accountManager.init();
        this.trayController = new TrayController(this.accountManager);
    }
}

// v3.3.45: no ozone override anymore — Electron runs as a native Wayland client
// under Lomiri and the Maliit on-screen keyboard uses the Wayland text-input
// protocol (password fields work, as in 3.2.x). XMODIFIERS is still exported by
// command.sh for the X11/XWayland fallback.

appInstance = new ProspectMail();
appInstance.init();
