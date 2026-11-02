import path from 'node:path';
import {app, BrowserWindow, globalShortcut, session} from 'electron';
import AccountManager from './account-manager.mjs';
import {TrayController} from './controller/tray-controller.mjs';
import {startSocketServer, stopSocketServer} from './ipc-socket.mjs';
import {logger} from './logger.mjs';
import {setLanguage} from './i18n.mjs';
import {resolveLanguage, writeLangFile, settings} from './settings.mjs';
import {
    CONFIG_DIR,
    HEARTBEAT_FILE,
    EXIT_CLIENT_FILE,
    KILLED_CLIENT_FILE,
    CLOSE_FLAG_FILE,
    markCleanExit,
} from './config.mjs';
import fs from 'node:fs';

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
    } else if (!mainWindowEverVisible && heartbeatSeconds === 30 && appInstance?.mailController) {
        logger.warn('Main window never shown after 60s — forcing show()');
        try { appInstance.mailController.show(); } catch (e) { logger.error('Force show failed:', e); }
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
    // v3.3.5: only honor flags written AFTER this process started — a stale
    // flag left by a previous instance's orphaned wrapper must not kill the
    // new process (that was the intermittent startup crash).
    if (fs.existsSync(CLOSE_FLAG_FILE)) {
        try {
            const mtime = fs.statSync(CLOSE_FLAG_FILE).mtimeMs;
            fs.unlinkSync(CLOSE_FLAG_FILE);
            if (mtime > PROCESS_START) {
                logger.info('Close flag received (fresh) — exiting');
                app.exit(0);
            } else {
                logger.info('Stale close flag ignored (written before process start)');
            }
        } catch (e) { /* ignore */ }
    }
}, 2000);

// Set the app name to use kebab-case for config directory (avoids spaces in path)
// This must be set before app is ready
app.setPath("userData", path.join(app.getPath("appData"), "prospect-mail"));

// Set desktop name for proper notification handling on Linux
app.setDesktopName("UToutlookmail");

//Store commandline for global purpose
global.cmdLine = process.argv;

class ProspectMail {
    constructor() {
        this.accountManager = null;
        this.trayController = null;
        this.isQuitting = false;
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
            // Ensure lang file exists (re-write if deleted manually)
            writeLangFile();

            this.createControllers();
            this.startSocketServer();
            this.registerShortcuts();
        });

        app.on("browser-window-blur", () => {
            // Don't auto-quit when hideOnClose is active — windows are hidden, not closed
            if (settings.get("hideOnClose")) return;
            const count = BrowserWindow.getAllWindows()
                .filter(b => b.isVisible())
                .length;
            if (count === 0) {
                markCleanExit();
                app.exit(0);
            }
        });

        app.on("will-quit", (e) => {
            if (this.isQuitting) return;
            e.preventDefault();
            this.isQuitting = true;
            this.cleanupAndExit();
        });

        app.on("before-quit", (e) => {
            if (this.isQuitting) return;
            e.preventDefault();
            this.isQuitting = true;
            this.cleanupAndExit();
        });

        // 'quit' is not preventable — just clean up
        app.on("quit", () => {
            heartbeatExiting = true;
            clearInterval(heartbeatInterval);
            globalShortcut.unregisterAll();
            stopSocketServer();
        });

        process.on("SIGINT", () => {
            this.cleanupAndExit();
        });

        process.on("SIGTERM", () => {
            this.cleanupAndExit();
        });

        app.on("window-all-closed", () => {
            // v3.3.28: sync write — the wrapper must see this flag to avoid
            // relaunching the app after a swipe-close (see markCleanExit).
            markCleanExit();
            app.exit(0);
        });
    }

    startSocketServer() {
        this.socketServer = startSocketServer({
            onQuit: () => {
                logger.info("Socket: quit command received");
                this.cleanupAndExit();
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
        if (this.isQuitting) return;
        this.isQuitting = true;
        // v3.3.28: write the clean-quit flag FIRST, synchronously, before the
        // async cookie flushes below — a SIGKILL during the flush must not
        // lose the flag (the wrapper would relaunch a deliberately quit app).
        // Skipped when the quit is a restart (settings import/reset).
        if (!global.restartRequested) markCleanExit();
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
        app.exit(0);
    }

    createControllers() {
        this.accountManager = new AccountManager();
        this.accountManager.init();
        this.trayController = new TrayController(this.accountManager);
    }
}

appInstance = new ProspectMail();
appInstance.init();
