import path from 'node:path';
import {app, BrowserWindow, globalShortcut} from 'electron';
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
    CLOSE_FLAG_FILE,
} from './config.mjs';
import fs from 'node:fs';

// ============================================================
// Global error handlers — prevent silent crashes
// ============================================================
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    fs.writeFile(`${CONFIG_DIR}/crash.log`,
        `${new Date().toISOString()}\n${err.stack}\n`, {flag: 'a'},
        () => app.exit(1)
    );
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

// Heartbeat: write a counter to a file so the shell wrapper (command.sh) can
// detect whether the Electron process is still alive.
let heartbeatSeconds = 0;
let heartbeatExiting = false;
const heartbeatInterval = setInterval(() => {
    if (heartbeatExiting) return;
    heartbeatSeconds++;
    const content = heartbeatSeconds.toString();

    const visibleCount = BrowserWindow.getAllWindows()
        .filter(b => b.isVisible())
        .length;

    // After 10 heartbeats with no visible window, signal exit and quit
    if (heartbeatSeconds > 10) {
        if (visibleCount > 0) {
            heartbeatSeconds = 0;
        } else {
            fs.writeFile(EXIT_CLIENT_FILE, content, err => {
                if (err) logger.error(err);
            });
            app.exit(0);
            return;
        }
    }

    fs.writeFile(HEARTBEAT_FILE, content, err => {
        if (err) logger.error(err);
    });

    // Check for external close flag from the shell wrapper (fallback for socket)
    if (fs.existsSync(CLOSE_FLAG_FILE)) {
        app.exit(0);
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
        app.on("second-instance", () => {
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
            fs.writeFile(EXIT_CLIENT_FILE, "quitclient", err => {
                if (err) logger.error(err);
            });
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

    cleanupAndExit() {
        heartbeatExiting = true;
        clearInterval(heartbeatInterval);
        stopSocketServer();
        fs.writeFile(`${CONFIG_DIR}/killedmail`, "quitclient", err => {
            if (err) logger.error(err);
        });
        app.exit(0);
    }

    createControllers() {
        this.accountManager = new AccountManager();
        this.accountManager.init();
        this.trayController = new TrayController(this.accountManager);
    }
}

new ProspectMail().init();
