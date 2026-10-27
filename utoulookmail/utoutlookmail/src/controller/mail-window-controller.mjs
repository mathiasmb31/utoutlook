import {app, BrowserWindow, ipcMain, Menu, shell, clipboard, Notification, nativeImage, nativeTheme, screen, session} from 'electron';
import {spawn} from 'child_process';
import getClientFile from './client-injector.mjs';
import path from 'node:path';
import {settings} from "../settings.mjs";
import {t, getAllTranslations} from "../i18n.mjs";
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {
    CONFIG_DIR,
    CACHE_DIR,
    INIT_FLAG_FILE,
    LOGIN_FLAG_FILE,
    NOTIF_FLAG_FILE,
    ICON_PATH,
} from '../config.mjs';
import {logger} from '../logger.mjs';

const __filenameNew = fileURLToPath(import.meta.url);
const __dirnameNew = path.dirname(__filenameNew);

// Zoom levels for mobile (step through with zoomIn/zoomOut)
const ZOOM_LEVELS = [0.75, 0.85, 1.0, 1.15, 1.3, 1.5];

/**
 * MailWindowController — Orchestre la fenêtre principale Electron affichant Outlook Web.
 *
 * Responsabilités :
 * - Création et gestion de la BrowserWindow (taille, frame, preload)
 * - Injection CSS mobile-first (main.css, no-frame.css, dark mode)
 * - Détection des mails non lus via observer DOM injecté
 * - Relais des notifications vers Ubuntu Touch (D-Bus Postal via binary `notify`)
 * - Communication shell↔Electron (Unix socket + fichiers trigger dans CACHE_DIR)
 * - Zoom, injection de texte, gestes tactiles
 * - Splash screen, détection hors-ligne, CSP
 */
class MailWindowController {
    constructor(accountConfig = null) {
        // Per-instance state (was module-level — caused cross-account leaks)
        this.mainMailServiceUrl = null;
        this.deeplinkUrls = [];
        this.safelinksUrls = [];
        this.mailServicesUrls = [];
        this.showWindowFrame = true;
        this.loginPage = 0;
        this.pageLoadTimes = []; // timestamps of recent page loads for loop detection
        this.redirectLoopDetected = false;
        this.loginHintIntercepts = 0; // count of login_hint redirects intercepted
        this.loopDetectorRetries = 0; // count of loop detector activations (max 3)
        this.currentZoomIndex = 2; // start at 1.0
        this.initialMinimization = { domReady: false };

        this.cssKeys = { main: null, noFrame: null, dark: null, focus: null, accent: null };
        this.cacheWatcher = null;
        this.triggerTimers = new Map(); // debounce timers for file triggers
        this.splashWindow = null;
        this.splashClosed = false; // true once splash has been dismissed (URL match or timeout)
        this.cookieFlushInterval = null; // periodic cookie flush to disk
        this.observerHealthCheck = null; // periodic observer connectivity check
        this.observerWasActive = false; // true once observer connected at least once
        // Multi-account: each account has its own config and session partition
        this.accountConfig = accountConfig;
        this.accountId = accountConfig?.id || 'default';
        this.accountName = accountConfig?.name || 'Compte principal';
        this.sessionPartition = accountConfig?.partition || 'persist:utoutlook-default';
        this.unreadCount = 0;
        this.init();
        // Check both command-line flag and settings for initial minimization
        const hasMinimizedFlag = global.cmdLine.indexOf("--minimized") !== -1;
        const startMinimizedSetting = settings.get("startMinimized");
        this.initialMinimization.domReady = hasMinimizedFlag || startMinimizedSetting;
    }

    /**
     * Recharge les settings depuis le store et construit les patterns RegExp
     * pour les URLs internes, externes et safelinks.
     */
    reloadSettings() {
        this.showWindowFrame = settings.get("showWindowFrame");
        // Use account-specific URL if configured, fall back to global setting
        this.mainMailServiceUrl = this.accountConfig?.url || settings.get("urlMainWindow");
        this.deeplinkUrls = settings.get("urlsInternal");
        this.mailServicesUrls = settings.get("urlsExternal");
        this.safelinksUrls = settings.get("safelinksUrls");
        this.focusMode = settings.get("focusMode") || false;
        this.accentColor = settings.get("accentColor") || '#0078d4';

        logger.info("Loaded settings", {
            mainMailServiceUrl: this.mainMailServiceUrl,
            deeplinkUrls: this.deeplinkUrls,
            mailServicesUrls: this.mailServicesUrls,
            safelinksUrls: this.safelinksUrls,
        });

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        this.safelinksPattern = new RegExp(this.safelinksUrls.map(escapeRegex).join("|"));
        this.deeplinkPattern = new RegExp(this.deeplinkUrls.map(escapeRegex).join("|"));
        this.mailServicesPattern = new RegExp(this.mailServicesUrls.map(escapeRegex).join("|"));
    }

    /**
     * Ouvre une URL dans le navigateur externe (ou custom browser si configuré).
     * Bloque les protocoles non-HTTP(S).
     * @param {string} url - L'URL à ouvrir
     */
    openExternalLink(url) {
        try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                logger.warn('Blocked non-HTTP(S) URL:', url);
                return;
            }
        } catch (err) {
            logger.error('Invalid URL:', url, err);
            return;
        }

        const customBrowserPath = settings.get("customBrowserPath");
        if (customBrowserPath) {
            logger.info(`Opening URL in custom browser: ${customBrowserPath}`);
            try {
                const child = spawn(customBrowserPath, [url], {detached: true, stdio: "ignore"});
                child.unref();
                child.on('error', (err) => {
                    logger.error('Failed to spawn custom browser:', err);
                    shell.openExternal(url);
                });
            } catch (err) {
                logger.error('Failed to spawn custom browser:', err);
                shell.openExternal(url);
            }
        } else {
            shell.openExternal(url);
        }
    }

    // --- Socket command handlers ---

    /**
     * Applique une action de zoom sur la webContents.
     * @param {'in'|'out'|'reset'|number} action - Direction ou facteur de zoom direct
     */
    handleZoomCommand(action) {
        if (!this.win || this.win.isDestroyed()) return;
        if (action === 'in') {
            this.currentZoomIndex = Math.min(this.currentZoomIndex + 1, ZOOM_LEVELS.length - 1);
        } else if (action === 'out') {
            this.currentZoomIndex = Math.max(this.currentZoomIndex - 1, 0);
        } else if (action === 'reset') {
            this.currentZoomIndex = 2;
        } else if (typeof action === 'number') {
            this.win.webContents.setZoomFactor(action);
            return;
        }
        this.win.webContents.setZoomFactor(ZOOM_LEVELS[this.currentZoomIndex]);
        logger.info(`Zoom set to ${ZOOM_LEVELS[this.currentZoomIndex]}`);
    }

    /**
     * Insère du texte dans le champ actif de la page (clavier virtuel).
     * @param {string} text - Texte à insérer
     */
    insertText(text) {
        if (!this.win || this.win.isDestroyed()) return;
        this.win.webContents.insertText(text);
    }

    // --- File-based triggers (replaces auto_zoom.sh and daemon.sh) ---

    /**
     * Surveille le CACHE_DIR pour les fichiers trigger (zoomtodo_*, sendMsg*).
     * Utilise un debounce de 100ms pour éviter les déclenchements multiples.
     */
    startCacheWatcher() {
        fs.mkdirSync(CACHE_DIR, {recursive: true});
        this.cacheWatcher = fs.watch(CACHE_DIR, (eventType, filename) => {
            if (!filename) return;
            // Debounce: rapid file events (create+rename+change) should trigger once
            const prefix = filename.startsWith('zoomtodo_') ? 'zoom:' :
                           filename.startsWith('sendMsg') ? 'text:' : null;
            if (!prefix) return;

            // Clear any pending timer for this trigger type
            const timerKey = prefix;
            if (this.triggerTimers.has(timerKey)) {
                clearTimeout(this.triggerTimers.get(timerKey));
            }

            // Schedule the handler after a short quiet period
            this.triggerTimers.set(timerKey, setTimeout(() => {
                this.triggerTimers.delete(timerKey);
                if (prefix === 'zoom:') {
                    this.handleZoomFileTrigger(filename);
                } else {
                    this.handleTextFileTrigger(filename);
                }
            }, 100));
        });
        logger.info(`Watching ${CACHE_DIR} for zoom/text triggers`);
    }

    handleZoomFileTrigger(filename) {
        // zoomtodo_N → zoom in N times
        const match = filename.match(/zoomtodo_(\d+)/);
        if (!match) return;
        const count = parseInt(match[1], 10);
        // Clean up all zoomtodo files
        this.cleanupTriggerFiles('zoomtodo_');
        for (let i = 0; i < count; i++) {
            this.handleZoomCommand('in');
        }
    }

    handleTextFileTrigger(filename) {
        const filepath = path.join(CACHE_DIR, filename);
        try {
            const text = fs.readFileSync(filepath, 'utf-8');
            // Extract text after the last underscore (cut.sh behavior)
            const finalText = text.includes('_') ? text.substring(text.lastIndexOf('_') + 1) : text;
            this.insertText(finalText);
        } catch (err) {
            logger.error('Failed to read text trigger file:', err);
        }
        // Clean up
        try { fs.unlinkSync(filepath); } catch (e) { /* ignore */ }
    }

    cleanupTriggerFiles(prefix) {
        try {
            const files = fs.readdirSync(CACHE_DIR);
            for (const f of files) {
                if (f.startsWith(prefix)) {
                    fs.unlinkSync(path.join(CACHE_DIR, f));
                }
            }
        } catch (err) { /* ignore */ }
    }

    // --- Session persistence: periodic cookie flush ---

    /**
     * Flush cookies to disk periodically so session survives SIGKILL / OOM.
     * Chromium flushes every ~30s by default, but on Ubuntu Touch the app is
     * frequently killed without a clean shutdown. We flush every 15s to be safe.
     */
    startCookieFlush() {
        this.cookieFlushInterval = setInterval(() => {
            this.flushSessionCookies();
        }, 15000);
        logger.info('Cookie flush interval started (15s)');
    }

    /**
     * Flush this account's session cookies to disk immediately.
     */
    async flushSessionCookies() {
        try {
            const ses = session.fromPartition(this.sessionPartition);
            await ses.cookies.flushStore();
            logger.debug('Cookies flushed to disk');
        } catch (err) {
            logger.warn('Failed to flush cookies:', err.message);
        }
    }

    /**
     * Clear all cookies for Outlook/Microsoft domains in this session partition.
     * Used to break redirect loops (mail → oauthRedirect → mail → …).
     */
    async clearOutlookSession() {
        try {
            const ses = session.fromPartition(this.sessionPartition);
            const cookies = await ses.cookies.get({});
            let cleared = 0;
            for (const cookie of cookies) {
                const domain = (cookie.domain || '').toLowerCase();
                if (domain.includes('outlook') ||
                    domain.includes('microsoft') ||
                    domain.includes('live.com') ||
                    domain.includes('office.com') ||
                    domain.includes('office365') ||
                    domain.includes('sharepoint') ||
                    domain.includes('msauth') ||
                    domain.includes('msocdn') ||
                    domain.includes('msecnd') ||
                    domain.includes('msftauth')) {
                    const url = cookie.secure ? `https://${cookie.domain}${cookie.path}` : `http://${cookie.domain}${cookie.path}`;
                    await ses.cookies.remove(url, cookie.name);
                    cleared++;
                }
            }
            await ses.cookies.flushStore();
            logger.info(`Cleared ${cleared} Outlook/Microsoft cookies`);
        } catch (err) {
            logger.error('Failed to clear Outlook session:', err.message);
        }
    }

    /**
     * Copy session/auth cookies from office.com domains to live.com domains.
     * Personal Microsoft accounts get redirected from outlook.office.com to
     * outlook.live.com after login, but the session cookies set on .office.com
     * are not sent to .live.com — causing an infinite loop with oauthRedirect.html.
     * This copies the cookies so the session is valid on both domains.
     */
    async syncCookiesToLiveCom() {
        try {
            const ses = session.fromPartition(this.sessionPartition);
            const cookies = await ses.cookies.get({});
            let copied = 0;
            for (const cookie of cookies) {
                const domain = (cookie.domain || '').toLowerCase();
                // Map source domains to live.com equivalents.
                // Also copy login.live.com cookies to outlook.live.com specifically,
                // and office.com cookies to .live.com (parent domain) for sharing.
                const targets = [];
                if (domain === '.office.com' || domain === '.office365.com') {
                    targets.push('.live.com');
                } else if (domain === 'outlook.office.com' || domain === 'outlook.office365.com') {
                    targets.push('outlook.live.com', '.live.com');
                } else if (domain === '.microsoft.com' || domain === '.microsoftonline.com' ||
                           domain === 'login.microsoftonline.com' || domain === 'outlook.microsoft.com') {
                    targets.push('.live.com', 'outlook.live.com');
                } else if (domain === '.msauth.net' || domain === '.msocdn.com' ||
                           domain === '.msftauth.net' || domain === '.msecnd.net') {
                    targets.push('.live.com', 'outlook.live.com');
                } else if (domain === 'login.live.com') {
                    // login.live.com cookies → outlook.live.com (same parent, but be explicit)
                    targets.push('outlook.live.com');
                }
                for (const newDomain of targets) {
                    const host = newDomain.replace(/^\./, '');
                    const url = `https://${host}${cookie.path || '/'}`;
                    await ses.cookies.set({
                        url,
                        name: cookie.name,
                        value: cookie.value,
                        domain: newDomain,
                        path: cookie.path || '/',
                        secure: true,           // required for SameSite=None
                        httpOnly: cookie.httpOnly,
                        expirationDate: cookie.expirationDate,
                        // Force SameSite=None so cookies are sent cross-site
                        // (office.com ↔ live.com are different sites)
                        sameSite: 'no_restriction',
                    });
                    copied++;
                }
            }
            await ses.cookies.flushStore();
            logger.info(`Synced ${copied} cookies → live.com (SameSite=None)`);
            // Debug: log cookie names for troubleshooting
            if (copied > 0) {
                const liveCookies = await ses.cookies.get({ domain: '.live.com' });
                const names = liveCookies.map(c => c.name).join(', ');
                logger.info(`live.com cookies (${liveCookies.length}): ${names.substring(0, 500)}`);
            }
        } catch (err) {
            logger.error('Failed to sync cookies to live.com:', err.message);
        }
    }

    // --- Observer health check ---

    /**
     * Periodically check if the unread observer is still connected.
     * If the page navigated or the observer was lost, re-inject it.
     * Outlook is a SPA — the observer can silently die on navigation.
     */
    startObserverHealthCheck() {
        this.observerHealthCheck = setInterval(async () => {
            if (!this.win || this.win.isDestroyed()) return;
            try {
                // First verify the page can execute JS at all
                const pageReady = await this.win.webContents.executeJavaScript(
                    `(() => {
                        try {
                            return document.readyState === 'complete'
                                || document.readyState === 'interactive';
                        } catch(e) { return false; }
                    })()`
                );
                if (!pageReady) {
                    logger.debug('Health check: page not ready, skipping');
                    return;
                }

                const connected = await this.win.webContents.executeJavaScript(
                    `(() => {
                        return typeof window.__utoutlookObserverActive !== 'undefined'
                            && window.__utoutlookObserverActive === true;
                    })()`
                );
                if (connected) {
                    // Observer is active — remember for future checks
                    this.observerWasActive = true;
                } else if (this.observerWasActive) {
                    // Observer WAS active but is now gone (SPA navigation killed it)
                    // Only re-inject in this case — let the observer's own retry
                    // backoff handle the initial connection on first load.
                    this.observerWasActive = false;
                    logger.info('Observer disconnected — re-injecting');
                    await this.addUnreadNumberObserver();
                }
                // else: observer never connected yet — its own retry backoff
                // (3s → 30s exponential) is handling initial connection.
            } catch (err) {
                // Page might not be ready or navigating — will retry next interval
                logger.debug('Observer health check failed:', err.message);
            }
        }, 10000);
        logger.info('Observer health check started (10s)');
    }

    // --- UBports notification relay ---

    /**
     * Retourne le chemin du binary `notify` embarqué, ou null s'il n'existe pas.
     * @returns {string|null}
     */
    getNotifyBinaryPath() {
        const appDir = path.dirname(process.execPath);
        const notifyPath = path.resolve(appDir, '..', 'notify');
        return fs.existsSync(notifyPath) ? notifyPath : null;
    }

    /**
     * Envoie une notification Ubuntu Touch via le binary `notify` (D-Bus Postal).
     * @param {string} title - Titre de la notification
     * @param {string} [body] - Corps de la notification
     * @param {Function} [onError] - Callback appelé si le spawn échoue (async)
     * @returns {boolean} true si la notification a été envoyée
     */
    sendUbportsNotification(title, body, onError) {
        const notifyPath = this.getNotifyBinaryPath();
        if (!notifyPath) return false;
        try {
            const args = body ? [title, body] : [title];
            const child = spawn(notifyPath, args, {detached: true, stdio: 'ignore'});
            child.unref();
            child.on('error', (err) => {
                logger.error('Failed to spawn notify binary:', err);
                if (onError) onError();
            });
            return true;
        } catch (err) {
            logger.error('Failed to spawn notify binary:', err);
            return false;
        }
    }

    // --- CSP ---

    setupCSP() {
        // Apply CSP to this account's session partition (not just defaultSession)
        const ses = session.fromPartition(this.sessionPartition);
        ses.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self' https://outlook.com https://*.outlook.com " +
                        "https://outlook.office.com https://*.office.com " +
                        "https://*.office365.com https://*.live.com https://*.live.net " +
                        "https://*.microsoft.com https://*.microsoftonline.com " +
                        "https://*.msauth.net https://*.msocdn.com " +
                        "https://*.sharepoint.com https://*.msecnd.net https://*.msftauth.net " +
                        "https://*.cdn.office.net https://*.onecdn.static.microsoft " +
                        "https://*.github.com https://*.githubassets.com https://*.bing.com; " +
                        // script-src must include ALL domains that serve JS, not just
                        // default-src — otherwise Outlook boot JS from CDNs is blocked
                        // (olkerror.html?esrc=NoBootJs). blob: needed for web workers.
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: " +
                        "https://outlook.com https://*.outlook.com " +
                        "https://outlook.office.com https://*.office.com https://*.office365.com " +
                        "https://*.live.com https://*.live.net " +
                        "https://*.microsoft.com https://*.microsoftonline.com " +
                        "https://*.msocdn.com https://*.msauth.net https://*.msecnd.net " +
                        "https://*.msftauth.net https://*.cdn.office.net https://*.sharepoint.com " +
                        "https://*.onecdn.static.microsoft " +
                        "https://*.github.com https://*.githubassets.com https://*.bing.com; " +
                        "style-src 'self' 'unsafe-inline' https://outlook.com https://*.outlook.com " +
                        "https://outlook.office.com https://*.office.com " +
                        "https://*.office365.com https://*.live.com https://*.live.net " +
                        "https://*.microsoft.com https://*.microsoftonline.com " +
                        "https://*.msocdn.com https://*.msauth.net " +
                        "https://*.msftauth.net https://*.cdn.office.net https://*.onecdn.static.microsoft " +
                        "https://*.github.com https://*.githubassets.com https://*.bing.com; " +
                        "img-src 'self' data: https: blob:; " +
                        "connect-src 'self' https://outlook.com https://*.outlook.com " +
                        "https://outlook.office.com wss://*.office.com " +
                        "https://*.live.com https://*.live.net " +
                        "https://*.office365.com https://*.sharepoint.com " +
                        "https://*.microsoft.com https://*.microsoftonline.com https://*.msocdn.com " +
                        "https://*.msauth.net https://*.msecnd.net https://*.msftauth.net " +
                        "https://*.cdn.office.net https://*.onecdn.static.microsoft " +
                        "https://*.github.com https://*.githubassets.com https://*.bing.com " +
                        "wss://*.live.com wss://*.live.net wss://*.office365.com; " +
                        "font-src 'self' https://outlook.com https://*.outlook.com " +
                        "https://outlook.office.com https://*.office.com " +
                        "https://*.office365.com https://*.live.com https://*.live.net " +
                        "https://*.microsoft.com https://*.microsoftonline.com " +
                        "https://*.msocdn.com https://*.msauth.net " +
                        "https://*.msftauth.net https://*.cdn.office.net https://*.onecdn.static.microsoft " +
                        "https://*.github.com https://*.githubassets.com https://*.bing.com data:; " +
                        "media-src 'self' https: blob:; " +
                        "frame-src 'self' https://outlook.com https://*.outlook.com " +
                        "https://outlook.office.com https://*.office.com " +
                        "https://*.office365.com https://*.live.com https://*.live.net " +
                        "https://*.microsoft.com https://*.microsoftonline.com https://*.sharepoint.com; " +
                        "worker-src 'self' blob:;"
                    ]
                }
            });
        });
    }

    // --- Dark mode (amélioré) ---

    /**
     * Détermine si le mode sombre doit être actif.
     * @returns {boolean}
     */
    shouldUseDarkMode() {
        const mode = settings.get("darkMode") || 'auto';
        if (mode === 'on') return true;
        if (mode === 'off') return false;
        return nativeTheme.shouldUseDarkColors;
    }

    /**
     * Cycle le mode sombre : auto → on → off → auto.
     * @returns {string} nouveau mode ('auto' | 'on' | 'off')
     */
    async toggleDarkMode() {
        const current = settings.get("darkMode") || 'auto';
        const next = current === 'auto' ? 'on' : current === 'on' ? 'off' : 'auto';
        settings.set("darkMode", next);
        await this.applyDarkModeClass();
        await this.injectStyles();
        logger.info(`Dark mode: ${next}`);
        return next;
    }

    /**
     * Applique ou retire la classe dark-mode sur <html> selon le setting.
     */
    async applyDarkModeClass() {
        if (!this.win || this.win.isDestroyed()) return;
        const dark = this.shouldUseDarkMode();
        await this.win.webContents.executeJavaScript(
            `document.documentElement.classList.toggle('dark-mode', ${dark});`
        );
    }

    getDarkModeCSS() {
        return `
            /* Dark mode — Outlook web */
            html.dark-mode body,
            html.dark-mode [role="main"],
            html.dark-mode [class*="bodyContainer"],
            html.dark-mode [class*="content"],
            html.dark-mode [class*="mainContent"],
            html.dark-mode [class*="readingPane"],
            html.dark-mode [class*="messageList"],
            html.dark-mode [class*="listView"] {
                background-color: #1a1a1a !important;
                color: #e0e0e0 !important;
            }
            /* Navigation pane */
            html.dark-mode [data-app-section="NavigationPane"],
            html.dark-mode [class*="folderPane"],
            html.dark-mode [class*="navigationPane"] {
                background-color: #252525 !important;
                color: #c0c0c0 !important;
            }
            /* Cards and surfaces */
            html.dark-mode [class*="card"],
            html.dark-mode [class*="surface"],
            html.dark-mode [class*="panel"],
            html.dark-mode [class*="dialog"] {
                background-color: #2d2d2d !important;
                color: #e0e0e0 !important;
            }
            /* Inputs */
            html.dark-mode input,
            html.dark-mode textarea,
            html.dark-mode [class*="textField"] {
                background-color: #3a3a3a !important;
                color: #e0e0e0 !important;
                border-color: #555 !important;
            }
            /* Links */
            html.dark-mode a { color: #6cb6ff !important; }
            /* Separators */
            html.dark-mode [class*="divider"],
            html.dark-mode hr {
                border-color: #444 !important;
            }
            /* System dark preference fallback */
            @media (prefers-color-scheme: dark) {
                body { background-color: #1a1a1a !important; color: #e0e0e0 !important; }
            }
        `;
    }

    // --- Focus mode (lecture concentrée) ---

    getFocusModeCSS() {
        return `
            /* Hide navigation pane */
            [data-app-section="NavigationPane"],
            [class*="folderPane"],
            [class*="navigationPane"],
            [class*="LeftRail"],
            [class*="leftRail"] {
                display: none !important;
            }
            /* Hide ads and banners */
            [class*="adBar"],
            [class*="AdBar"],
            [class*="premiumBanner"],
            [class*="upgradeBanner"] {
                display: none !important;
            }
            /* Hide reading pane header actions (keep first 3 primary buttons: Reply, Forward, etc.) */
            [class*="commandBar"] button:nth-child(n+4),
            [class*="commandBar"] [role="button"]:nth-child(n+4) {
                display: none !important;
            }
            /* Maximize email content area */
            [class*="readingPane"],
            [class*="messageBody"],
            [class*="emailContent"] {
                max-width: 100% !important;
                padding: 8px 16px !important;
            }
            /* Dim non-essential UI */
            [class*="headerBar"] > *:not(button):not([role="button"]),
            [class*="topBar"] > *:not(button):not([role="button"]) {
                opacity: 0.5 !important;
            }
            /* Focus indicator */
            body::after {
                content: "${t('focus.indicator')}";
                position: fixed;
                bottom: 8px;
                right: 8px;
                background: rgba(0,0,0,0.6);
                color: #fff;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                z-index: 9999;
                pointer-events: none;
                font-family: Ubuntu, sans-serif;
            }
        `;
    }

    // --- Accent color theme ---

    getAccentColorCSS(color) {
        return `
            /* Custom accent color override */
            :root {
                --utoutlook-accent: ${color} !important;
            }
            /* Buttons */
            button[class*="primary"],
            [role="button"][class*="primary"],
            button[class*="accent"],
            [class*="ms-Button--primary"] {
                background-color: ${color} !important;
                border-color: ${color} !important;
            }
            /* Links */
            a[class*="primary"],
            [class*="link"][class*="primary"] {
                color: ${color} !important;
            }
            /* Selection highlight */
            ::selection {
                background-color: ${color} !important;
                color: #fff !important;
            }
            /* Focus ring */
            *:focus-visible {
                outline-color: ${color} !important;
            }
            /* Progress bar */
            [class*="progressBar"] > div,
            [class*="progress"] > div {
                background-color: ${color} !important;
            }
        `;
    }

    /**
     * Bascule le mode lecture concentrée (focus mode).
     * @returns {boolean} nouvel état
     */
    async toggleFocusMode() {
        this.focusMode = !this.focusMode;
        settings.set("focusMode", this.focusMode);
        await this.injectStyles();
        logger.info(`Focus mode: ${this.focusMode ? 'ON' : 'OFF'}`);
        return this.focusMode;
    }

    /**
     * Définit la couleur d'accent personnalisée.
     * @param {string} color - Code couleur hex (#rrggbb)
     */
    async setAccentColor(color) {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
            logger.warn(`Invalid accent color: ${color}`);
            return;
        }
        this.accentColor = color;
        settings.set("accentColor", color);
        await this.injectStyles();
        logger.info(`Accent color set to: ${color}`);
    }

    // --- Lifecycle orchestrator ---

    init() {
        this.reloadSettings();
        this.setupCSP();
        this.createSplashWindow();
        this.createWindow();
        this.loadMainUrl();
        this.setupLoadingIndicators();
        this.setupContextMenu();
        this.setupIpcHandlers();
        this.setupWebContentsEvents();
        this.setupWindowOpenHandler();
        this.setupWindowEvents();
        this.setupScreenEvents();
        this.setupOfflineDetection();
        this.startCacheWatcher();
        this.startCookieFlush();
        this.startObserverHealthCheck();
    }

    // --- Splash screen ---

    createSplashWindow() {
        const splashPath = path.resolve(__dirnameNew, '../../public/splash.html');
        if (!fs.existsSync(splashPath)) return;

        const primaryDisplay = screen.getPrimaryDisplay();
        const {width, height} = primaryDisplay.workAreaSize;

        this.splashWindow = new BrowserWindow({
            width: Math.min(400, width),
            height: Math.min(500, height),
            frame: false,
            transparent: false,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            show: true,
            backgroundColor: '#0078d4',
            webPreferences: {
                contextIsolation: true,
                sandbox: true,
            },
        });

        this.splashWindow.setMenu(null);
        // Pass translations via query params
        const splashParams = new URLSearchParams({
            loading: t('splash.loading'),
            appName: t('app.name'),
        });
        this.splashWindow.loadFile(splashPath, {search: splashParams.toString()});

        // Safety timeout: close splash after 30s even if the mail interface
        // URL is never detected (slow connection, login wall, error page).
        // 15s was too short for Outlook on mobile — the splash would vanish
        // before the page finished loading, revealing a half-rendered page.
        this.splashTimeout = setTimeout(() => {
            logger.warn('Splash timeout (30s) — forcing splash close');
            this.closeSplashWindow();
        }, 30000);
    }

    closeSplashWindow() {
        if (this.splashClosed) return;
        this.splashClosed = true;
        if (this.splashTimeout) {
            clearTimeout(this.splashTimeout);
            this.splashTimeout = null;
        }
        if (this.splashWindow && !this.splashWindow.isDestroyed()) {
            this.splashWindow.close();
            this.splashWindow = null;
        }
        // Show the main window when the splash closes — the user should see
        // the app content (mail interface, login page, or offline overlay)
        // immediately after the splash disappears, never a blank screen.
        if (this.win && !this.win.isDestroyed() && !this.initialMinimization.domReady) {
            this.win.show();
        }
    }

    /**
     * Détecte si l'URL est l'interface mail réelle (pas une page de redirect
     * ou de login). Outlook redirige plusieurs fois au démarrage :
     * outlook.com → outlook.office.com → (login) → outlook.office.com/mail/
     * Le splash doit rester ouvert pendant ces redirects intermédiaires.
     * @param {string} url
     * @returns {boolean}
     */
    isMailInterfaceUrl(url) {
        return url.includes('/mail/') &&
               !url.includes('login') &&
               !url.includes('oauth') &&
               !url.includes('consent') &&
               !url.includes('error');
    }

    /**
     * Détecte si l'URL est une page de login. Dans ce cas, le splash doit
     * se fermer pour que l'utilisateur puisse interagir avec le formulaire.
     * @param {string} url
     * @returns {boolean}
     */
    isLoginPageUrl(url) {
        return url.includes('login.live.com') ||
               url.includes('login.microsoftonline.com') ||
               url.includes('login.microsoft.com') ||
               url.includes('account.microsoft.com') ||
               url.includes('oauth') ||
               url.includes('consent');
    }

    createWindow() {
        this.win = new BrowserWindow({
            x: 100, y: 100,
            width: 1400, height: 900,
            frame: this.showWindowFrame,
            autoHideMenuBar: true,
            show: false,
            title: `UToulookMail — ${this.accountName}`,
            icon: ICON_PATH,
            webPreferences: {
                contextIsolation: true,
                preload: path.join(__dirnameNew, "preload.js"),
                sandbox: false, // Required for preload to work on Ubuntu Touch
                partition: this.sessionPartition, // Isolate storage per account
            },
        });

        this.isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
        if (this.isDev) {
            this.win.webContents.openDevTools();
        }

        fs.writeFile(INIT_FLAG_FILE, 'initialise!', err => { if (err) logger.error(err); });
    }

    loadMainUrl() {
        // Dynamic user agent based on the Chromium version bundled with Electron
        const chromeVersion = process.versions.chrome || '143.0.0.0';
        const userAgentOS = "X11; Linux x86_64";
        const customUserAgent =
            `Mozilla/5.0 ${userAgentOS} AppleWebKit/537.36 (KHTML, like Gecko) ` +
            `Chrome/${chromeVersion} Safari/537.36 Edg/${chromeVersion}`;

        this.win.loadURL(this.mainMailServiceUrl, {userAgent: customUserAgent});

        this.win.webContents.on('did-finish-load', () => {
            this.loginPage++;
            const url = this.win.webContents.getURL();
            logger.info(`Page loaded #${this.loginPage}: ${url}`);

            // --- Splash lifecycle (hotfix #15) ---
            // The splash stays open during intermediate redirects (outlook.com →
            // outlook.office.com → …). Only close it when we reach the actual
            // mail interface OR a login page (user must be able to interact).
            // This prevents the jarring flash: splash → half-loaded page with
            // Outlook envelope loading screen → progress bar → fully loaded.
            if (!this.splashClosed && (this.isMailInterfaceUrl(url) || this.isLoginPageUrl(url))) {
                logger.info(`Splash closing — URL is ${this.isMailInterfaceUrl(url) ? 'mail interface' : 'login page'}`);
                this.closeSplashWindow();
            }

            // --- Cookie sync for personal accounts (hotfix #7c) ---
            // When outlook.office.com/mail/ loads with an auth code (#code=...),
            // the page will redirect to outlook.live.com/mail/?login_hint=... for
            // personal accounts. Sync cookies NOW (before the redirect) so the
            // session is valid on .live.com and the redirect loop is avoided.
            if (url.includes('outlook.office.com/mail') && url.includes('#code=')) {
                logger.info('Auth code detected — syncing cookies to live.com before redirect');
                this.syncCookiesToLiveCom();
            }

            // --- Redirect loop detection ---
            // Outlook sometimes loops: mail page → oauthRedirect.html → mail page → …
            // Detect when the same mail URL loads too many times in a short window
            // and break the loop by clearing the session (forces fresh login).
            const now = Date.now();
            this.pageLoadTimes.push({url, time: now});
            // Keep only loads from the last 60 seconds
            this.pageLoadTimes = this.pageLoadTimes.filter(p => now - p.time < 60000);

            const isMailPage = url.includes('outlook.com/mail') ||
                               url.includes('outlook.live.com/mail') ||
                               url.includes('outlook.office.com/mail') ||
                               url.includes('outlook.office365.com/mail');
            const mailLoads = this.pageLoadTimes.filter(p =>
                p.url.includes('outlook.com/mail') ||
                p.url.includes('outlook.live.com/mail') ||
                p.url.includes('outlook.office.com/mail') ||
                p.url.includes('outlook.office365.com/mail')
            );

            if (isMailPage && mailLoads.length >= 5 && !this.redirectLoopDetected) {
                this.redirectLoopDetected = true;
                this.loopDetectorRetries++;
                logger.warn(`Redirect loop detected (retry ${this.loopDetectorRetries}/3): ${mailLoads.length} mail page loads in 60s`);
                // Sync cookies from office.com → live.com and reload the clean mail URL.
                // The loop happens because session cookies don't transfer across domains.
                this.pageLoadTimes = [];
                if (this.loopDetectorRetries >= 3) {
                    logger.error('Loop detector: max retries reached — navigating to office.com for fresh login');
                    this.win.loadURL('https://outlook.office.com/mail/');
                    return;
                }
                this.syncCookiesToLiveCom().then(() => {
                    const currentUrl = this.win.webContents.getURL();
                    const cleanUrl = currentUrl.split('?')[0].split('#')[0];
                    logger.info(`Reloading ${cleanUrl} after cookie sync`);
                    this.win.loadURL(cleanUrl);
                    // Allow detector to fire again if loop persists
                    this.redirectLoopDetected = false;
                });
            }
        });

        fs.writeFile(LOGIN_FLAG_FILE, 'notif!', err => { if (err) logger.error(err); });
    }

    setupLoadingIndicators() {
        this.win.webContents.on('did-start-loading', () => {
            // hotfix #15: don't show the blue progress bar while the splash
            // is still open. The progress bar on a hidden window can still
            // appear as a blue line in the Lomiri app header — jarring when
            // the splash (blue background) is showing on top.
            if (!this.splashClosed) return;
            this.win.setProgressBar(0.3);
        });
        // did-stop-loading handled in setupWebContentsEvents (merged to avoid
        // listener accumulation — MaxListenersExceededWarning at 11 listeners)
    }

    setupContextMenu() {
        const isDev = this.isDev;
        this.win.webContents.on("context-menu", (_event, params) => {
            const menuTemplate = [];
            if (params.isEditable) {
                menuTemplate.push(
                    {label: t('ctx.undo'), role: "undo"},
                    {label: t('ctx.redo'), role: "redo"},
                    {type: "separator"},
                    {label: t('ctx.cut'), role: "cut", enabled: params.editFlags.canCut},
                    {label: t('ctx.copy'), role: "copy", enabled: params.editFlags.canCopy},
                    {label: t('ctx.paste'), role: "paste", enabled: params.editFlags.canPaste},
                    {type: "separator"},
                    {label: t('ctx.selectAll'), role: "selectAll"}
                );
            } else {
                if (params.selectionText) {
                    menuTemplate.push({label: t('ctx.copy'), role: "copy"});
                }
                if (params.linkURL) {
                    if (menuTemplate.length > 0) menuTemplate.push({type: "separator"});
                    menuTemplate.push(
                        {
                            label: t('ctx.openLink'),
                            click: () => { this.openExternalLink(params.linkURL); },
                        },
                        {
                            label: t('ctx.copyLink'),
                            click: () => { clipboard.writeText(params.linkURL); },
                        }
                    );
                }
                if (params.selectionText || params.pageURL) {
                    if (menuTemplate.length > 0) menuTemplate.push({type: "separator"});
                    menuTemplate.push({label: t('ctx.selectAll'), role: "selectAll"});
                }
            }
            if (isDev) {
                if (menuTemplate.length > 0) menuTemplate.push({type: "separator"});
                menuTemplate.push({
                    label: t('ctx.inspect'),
                    click: () => { this.win.webContents.inspectElement(params.x, params.y); },
                });
            }
            if (menuTemplate.length > 0) {
                Menu.buildFromTemplate(menuTemplate).popup();
            }
        });
    }

    setupIpcHandlers() {
        ipcMain.on("show", (event) => {
            // Only respond if this is our window's webContents
            if (this.win && event.sender === this.win.webContents) {
                this.show();
            }
        });

        ipcMain.on("insert-text", (event, text) => {
            if (this.win && event.sender === this.win.webContents) {
                this.insertText(text);
            }
        });

        ipcMain.on("zoom", (event, {action}) => {
            if (this.win && event.sender === this.win.webContents) {
                this.handleZoomCommand(action);
            }
        });

        // Per-account unread tracking (filter by sender)
        ipcMain.on("updateUnread", (event, value) => {
            if (this.win && event.sender === this.win.webContents) {
                this.unreadCount = value || 0;
                if (this.onUnreadChange) {
                    this.onUnreadChange(this.accountId, this.unreadCount);
                }
            }
        });

        ipcMain.on("show-notification", (event, {title, body, icon}) => {
            if (this.win && event.sender === this.win.webContents) {
                // hotfix #13: skip notification when the app is in the foreground.
                // The observer fires on every unread-count change (including SPA
                // re-renders that cause temporary fluctuations). Showing a Lomiri
                // notification while the user is already looking at the app is
                // jarring — the blue banner slides down, shows the envelope icon,
                // then dismisses. The badge (updateUnread) still updates normally.
                if (this.win.isVisible() && this.win.isFocused()) {
                    logger.info(`[NOTIFICATION SUPPRESSED] foreground — title="${title}" body="${body}"`);
                    return;
                }
                this.handleNotification(title, body, icon);
            }
        });

        // Focus mode toggle (from renderer or tray)
        ipcMain.on("toggle-focus-mode", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.toggleFocusMode();
            }
        });

        // Accent color change (from renderer or tray)
        ipcMain.on("set-accent-color", (event, color) => {
            if (this.win && event.sender === this.win.webContents) {
                this.setAccentColor(color);
            }
        });

        // Dark mode toggle (from renderer or tray)
        ipcMain.on("toggle-dark-mode", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.toggleDarkMode();
            }
        });

        // Reload (from renderer, e.g. offline.html retry button)
        ipcMain.on("reload", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.reloadWindow();
            }
        });
    }

    /**
     * Traite une demande de notification depuis le renderer.
     * @param {string} title
     * @param {string} body
     * @param {string|null} icon
     */
    handleNotification(title, body, icon) {
        logger.info(`[NOTIFICATION] title="${title}" body="${body}"`);
        fs.writeFile(NOTIF_FLAG_FILE, 'notif!', err => { if (err) logger.error(err); });

        // Relay to Ubuntu Touch notifications (D-Bus Postal / Lomiri)
        const sentToUbports = this.sendUbportsNotification(title, body, () => {
            // Async spawn failure — fall back to Electron native
            this.showElectronNotification(title, body, icon);
        });
        if (sentToUbports) return;

        // Fallback: Electron native notification (desktop)
        this.showElectronNotification(title, body, icon);
    }

    /**
     * Affiche une notification native Electron (fallback desktop).
     * @param {string} title
     * @param {string} body
     * @param {string|null} icon
     */
    showElectronNotification(title, body, icon) {
        if (!Notification.isSupported()) return;
        const notificationConfig = {title, body};
        const iconPath = icon || ICON_PATH;
        if (iconPath.startsWith("data:")) {
            notificationConfig.icon = nativeImage.createFromDataURL(iconPath);
        } else {
            notificationConfig.icon = iconPath;
        }
        const notification = new Notification(notificationConfig);
        notification.on("click", () => { this.show(); });
        notification.show();
    }

    setupWebContentsEvents() {
        // Log console messages from the renderer — captures JS errors, CSP violations
        this.win.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
            const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'log';
            // Skip noisy messages
            if (message.includes('Autofill') || message.includes('DevTools')) return;
            logger.info(`[console.${levelName}] ${message.substring(0, 500)}`);
        });

        // Log failed resource loads — helps diagnose boot failures (olkerror.html)
        this.win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            // -3 (ERR_ABORTED) is normal for SPA redirects — skip it
            if (errorCode === -3) return;
            logger.warn(`Load failed [${errorCode}] ${errorDescription}: ${validatedURL} (mainFrame=${isMainFrame})`);
        });

        // Insert styles and observer on DOM ready.
        // NOTE (hotfix #15): the splash is NOT closed here anymore. dom-ready
        // fires on every redirect during Outlook's startup chain. Closing the
        // splash here would reveal a half-loaded page (envelope icon + blue
        // progress bar). The splash is now closed by did-finish-load when the
        // URL is the actual mail interface or a login page.
        this.win.webContents.on("dom-ready", () => {
            this.injectStyles().catch(() => {});
            this.addUnreadNumberObserver().catch(() => {});
            this.injectGestures();

            // Apply dark mode if setting says so (auto follows system, on/off override)
            if (this.shouldUseDarkMode()) {
                this.win.webContents.executeJavaScript(
                    `document.documentElement.classList.add('dark-mode');`
                ).catch(() => {});
            } else {
                this.win.webContents.executeJavaScript(
                    `document.documentElement.classList.remove('dark-mode');`
                ).catch(() => {});
            }
        });

        // Re-inject on SPA navigation (Outlook is a single-page app)
        this.win.webContents.on('did-navigate-in-page', (_event, url) => {
            logger.info(`SPA navigation: ${url}`);
            this.applyDarkModeClass().catch(() => {});
            this.injectStyles().catch(() => {});
            this.addUnreadNumberObserver().catch(() => {});
            this.injectGestures();
        });

        // Intercept login_hint redirect and sync cookies (hotfix #7c):
        // After login on outlook.office.com, Microsoft redirects personal accounts
        // to outlook.live.com/mail/?login_hint=... The session cookies set on
        // .office.com are NOT sent to .live.com, so the page loops with
        // oauthRedirect.html. Fix: copy cookies from office.com → live.com
        // before loading. Keep the login_hint — the page needs it to identify
        // the account, and the synced cookies provide the session.
        this.win.webContents.on('will-navigate', (event, url) => {
            if (url.includes('outlook.live.com/mail') && url.includes('login_hint=')) {
                event.preventDefault();
                this.loginHintIntercepts++;
                logger.info(`Intercepted login_hint redirect #${this.loginHintIntercepts}: ${url}`);
                this.syncCookiesToLiveCom().then(() => {
                    logger.info(`Loading with synced cookies (login_hint preserved)`);
                    this.win.loadURL(url); // keep login_hint
                });
            }
        });

        // Re-inject after page finishes loading (catches late-rendered SPA content)
        // Also clears the progress bar — merged with setupLoadingIndicators
        // to keep a single did-stop-loading listener.
        this.win.webContents.on('did-stop-loading', () => {
            this.win.setProgressBar(-1);
            // Small delay to let the SPA render after load event
            setTimeout(() => {
                if (this.win && !this.win.isDestroyed()) {
                    this.addUnreadNumberObserver().catch(() => {});
                }
            }, 2000);
        });
    }

    setupWindowOpenHandler() {
        this.win.webContents.setWindowOpenHandler(({url}) => {
            if (url === "about:blank") {
                return {action: "allow", overrideBrowserWindowOptions: {autoHideMenuBar: true}};
            }
            if (this.safelinksPattern && this.safelinksPattern.test(url)) {
                this.openExternalLink(url);
                return {action: "deny"};
            }
            if (this.deeplinkPattern && this.deeplinkPattern.test(url)) {
                return {action: "allow", overrideBrowserWindowOptions: {autoHideMenuBar: true}};
            }
            if (this.mailServicesPattern && this.mailServicesPattern.test(url)) {
                this.win.loadURL(url);
                return {action: "deny"};
            }
            this.openExternalLink(url);
            return {action: "deny"};
        });
    }

    setupWindowEvents() {
        // Hide instead of quit on close
        this.win.on("close", (e) => {
            if (this.win.isVisible() && settings.get("hideOnClose")) {
                e.preventDefault();
                this.win.hide();
            }
        });

        // Hide instead of minimize
        this.win.on("minimize", (e) => {
            if (settings.get("hideOnMinimize")) {
                e.preventDefault();
                this.win.hide();
            }
        });

        // Window closed
        this.win.on("closed", () => {
            this.win = null;
            this.closeSplashWindow();
            if (this.cacheWatcher) {
                this.cacheWatcher.close();
                this.cacheWatcher = null;
            }
            // Clear all pending debounce timers
            for (const timer of this.triggerTimers.values()) {
                clearTimeout(timer);
            }
            this.triggerTimers.clear();
            // Stop connectivity monitor
            if (this.connectivityTimer) {
                clearInterval(this.connectivityTimer);
                this.connectivityTimer = null;
            }
            // Stop cookie flush
            if (this.cookieFlushInterval) {
                clearInterval(this.cookieFlushInterval);
                this.cookieFlushInterval = null;
            }
            // Stop observer health check
            if (this.observerHealthCheck) {
                clearInterval(this.observerHealthCheck);
                this.observerHealthCheck = null;
            }
            // Flush cookies one last time before window destruction
            this.flushSessionCookies();
            if (!global.preventAutoCloseApp) {
                app.exit(0);
            }
            global.preventAutoCloseApp = false;
        });
    }

    setupScreenEvents() {
        screen.on('display-metrics-changed', () => { this.handleDisplayChange(); });
        screen.on('display-added', () => this.handleDisplayChange());
        screen.on('display-removed', () => this.handleDisplayChange());
    }

    handleDisplayChange() {
        if (!this.win || this.win.isDestroyed()) return;
        const primaryDisplay = screen.getPrimaryDisplay();
        const {width, height} = primaryDisplay.size;
        const isPortrait = height > width;
        logger.info(`Display changed: ${width}x${height} (${isPortrait ? 'portrait' : 'landscape'})`);
        // Could adjust zoom or layout based on orientation
    }

    // --- Offline detection ---

    setupOfflineDetection() {
        this.isOffline = false;
        this.connectivityTimer = null;

        // Detect network failures on page load
        this.win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            // hotfix #14: only react to main-frame failures, not sub-resources.
            // Outlook SPA loads many images/scripts/XHRs — a single failed image
            // must NOT trigger the offline overlay + connectivity monitor, which
            // would reload the entire page (jarring flash: progress bar → reload
            // → Outlook splash envelope → back to app).
            if (!isMainFrame) return;
            // Network-related error codes.
            // NOTE: -3 (ERR_ABORTED) is intentionally excluded — Outlook SPA triggers
            // it during normal redirects/navigations, causing false offline overlays.
            const networkErrors = [-100, -101, -102, -105, -106, -109, -118, -121, -137, -323];
            if (networkErrors.includes(errorCode) && validatedURL && !validatedURL.startsWith('file://')) {
                logger.warn(`Network error ${errorCode}: ${errorDescription} — showing offline overlay`);
                this.showOfflineOverlay();
                this.startConnectivityMonitor();
            }
        });
    }

    showOfflineOverlay() {
        if (!this.win || this.win.isDestroyed()) return;
        this.isOffline = true;
        const tr = getAllTranslations();

        this.win.webContents.executeJavaScript(`
            (() => {
                // Remove existing overlay if any
                const existing = document.getElementById('utoutlook-offline-overlay');
                if (existing) existing.remove();

                const overlay = document.createElement('div');
                overlay.id = 'utoutlook-offline-overlay';
                overlay.innerHTML = \`
                    <div style="position:fixed;top:0;left:0;width:100%;height:100%;
                         background:#1a1a2e;z-index:99999;display:flex;flex-direction:column;
                         align-items:center;justify-content:center;font-family:Ubuntu,sans-serif;
                         color:#e0e0e0;text-align:center;padding:24px;box-sizing:border-box;">
                        <div style="font-size:72px;margin-bottom:24px;opacity:0.6;">&#x1F4F6;</div>
                        <h1 style="font-size:24px;font-weight:300;margin-bottom:12px;">${tr['offline.title']}</h1>
                        <p style="font-size:16px;opacity:0.7;margin-bottom:32px;line-height:1.5;">
                            ${tr['offline.message']}
                        </p>
                        <div style="width:24px;height:24px;border:2px solid rgba(255,255,255,0.2);
                             border-top-color:#0078d4;border-radius:50%;
                             animation:utoutlook-spin 0.8s linear infinite;"></div>
                        <div style="margin-top:16px;font-size:13px;opacity:0.5;">${tr['offline.autoReconnect']}</div>
                    </div>
                \`;
                // Add spinner animation
                const style = document.createElement('style');
                style.textContent = '@keyframes utoutlook-spin{to{transform:rotate(360deg)}}';
                document.head.appendChild(style);
                document.body.appendChild(overlay);
            })()
        `).catch(err => logger.error('Failed to show offline overlay:', err));

        // Notify via UBports
        this.sendUbportsNotification(t('app.name'), t('notif.offline.title'));
    }

    hideOfflineOverlay() {
        if (!this.win || this.win.isDestroyed()) return;
        this.isOffline = false;

        this.win.webContents.executeJavaScript(`
            (() => {
                const overlay = document.getElementById('utoutlook-offline-overlay');
                if (overlay) overlay.remove();
            })()
        `).catch(err => logger.error('Failed to hide offline overlay:', err));
    }

    startConnectivityMonitor() {
        if (this.connectivityTimer) clearInterval(this.connectivityTimer);

        this.connectivityTimer = setInterval(async () => {
            if (!this.win || this.win.isDestroyed()) {
                clearInterval(this.connectivityTimer);
                this.connectivityTimer = null;
                return;
            }

            try {
                const online = await this.win.webContents.executeJavaScript('navigator.onLine');
                if (online) {
                    // hotfix #14: do NOT reload the page. A full reload causes
                    // a jarring flash (progress bar → page reload → Outlook splash
                    // envelope animation → back to app). Just hide the overlay —
                    // the Outlook SPA reconnects and refreshes on its own.
                    logger.info('Connectivity restored — hiding offline overlay');
                    clearInterval(this.connectivityTimer);
                    this.connectivityTimer = null;
                    this.hideOfflineOverlay();
                    this.sendUbportsNotification(t('app.name'), t('notif.online.title'));
                }
            } catch (err) {
                // Page might not be ready, keep polling
            }
        }, 3000);
    }

    async injectStyles() {
        if (!this.cssKeys) this.cssKeys = { main: null, noFrame: null, dark: null, focus: null, accent: null };

        // Remove previously inserted CSS
        for (const key of ['main', 'noFrame', 'dark', 'focus', 'accent']) {
            if (this.cssKeys[key]) {
                try { await this.win.webContents.removeInsertedCSS(this.cssKeys[key]); } catch (e) { /* ignore */ }
                this.cssKeys[key] = null;
            }
        }

        // Insert fresh CSS
        this.cssKeys.main = await this.win.webContents.insertCSS(getClientFile("main.css"));
        if (!this.showWindowFrame) {
            this.cssKeys.noFrame = await this.win.webContents.insertCSS(getClientFile("no-frame.css"));
        }
        if (this.shouldUseDarkMode()) {
            this.cssKeys.dark = await this.win.webContents.insertCSS(this.getDarkModeCSS());
        }
        if (this.focusMode) {
            this.cssKeys.focus = await this.win.webContents.insertCSS(this.getFocusModeCSS());
        }
        if (this.accentColor && this.accentColor !== '#0078d4') {
            this.cssKeys.accent = await this.win.webContents.insertCSS(this.getAccentColorCSS(this.accentColor));
        }
    }

    async addUnreadNumberObserver() {
        if (!this.win || this.win.isDestroyed()) return;
        // Inject translations as a global before the observer script
        const tr = getAllTranslations();
        const i18nJson = JSON.stringify({
            newMessagesTitle: tr['notif.newMessages.title'],
            newMessagesBody: tr['notif.newMessages.body'],
            calendarTitle: tr['notif.calendar.title'],
            appName: tr['app.name'],
        });
        // executeJavaScript returns a Promise — catch rejections to avoid
        // unhandled rejections when the page is navigating or not ready.
        try {
            await this.win.webContents.executeJavaScript(
                `window.__utoutlookI18n = ${i18nJson};\n` +
                getClientFile("unread-number-observer.js")
            );
        } catch (err) {
            // Page may be navigating — will be re-injected by health check or next event
            logger.debug('Observer injection deferred (page not ready):', err.message);
        }
    }

    injectGestures() {
        if (!this.win || this.win.isDestroyed()) return;
        this.win.webContents.executeJavaScript(
            getClientFile("gestures.js")
        ).catch(() => {
            // gestures.js may not exist yet or page not ready, ignore
        });
    }

    /**
     * Bascule la visibilité de la fenêtre (show/hide).
     */
    toggleWindow() {
        if (this.win.isVisible()) {
            this.win.hide();
        } else {
            this.initialMinimization.domReady = false;
            this.show();
        }
    }

    /**
     * Recharge la page Outlook.
     */
    reloadWindow() {
        this.initialMinimization.domReady = false;
        this.win.reload();
    }

    /**
     * Affiche la fenêtre principale (restore si minimisée).
     * Extrait également le token fb_dtsg de la page.
     */
    async show() {
        this.initialMinimization.domReady = false;
        if (this.win.isMinimized()) {
            this.win.restore();
        } else {
            this.win.show();
        }
        this.win.focus();

        // Extract fb_dtsg token from the page
        try {
            const result = await this.win.webContents.executeJavaScript(
                `(() => { const el = document.querySelector('input[name="fb_dtsg"]'); return el ? el.value : null; })()`
            );
            if (result) logger.debug("fb_dtsg token retrieved");
        } catch (err) {
            logger.debug("Could not extract fb_dtsg token:", err.message);
        }
    }
}

export default MailWindowController
