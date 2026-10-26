import {app, BrowserWindow, ipcMain, Menu, shell, clipboard, Notification, nativeImage, nativeTheme, screen, session} from 'electron';
import {spawn} from 'child_process';
import getClientFile from './client-injector.mjs';
import path from 'node:path';
import {settings} from "../settings.mjs";
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

let mainMailServiceUrl;
let deeplinkUrls;
let safelinksUrls;
let mailServicesUrls;
let showWindowFrame;
let loginPage;
const __filenameNew = fileURLToPath(import.meta.url);
const __dirnameNew = path.dirname(__filenameNew);

// Setted by cmdLine to initial minimization
const initialMinimization = {
    domReady: false,
};

// Zoom levels for mobile (step through with zoomIn/zoomOut)
const ZOOM_LEVELS = [0.75, 0.85, 1.0, 1.15, 1.3, 1.5];
let currentZoomIndex = 2; // start at 1.0

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
        loginPage = 0;
        this.cssKeys = { main: null, noFrame: null, dark: null, focus: null, accent: null };
        this.cacheWatcher = null;
        this.triggerTimers = new Map(); // debounce timers for file triggers
        this.splashWindow = null;
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
        initialMinimization.domReady = hasMinimizedFlag || startMinimizedSetting;
    }

    /**
     * Recharge les settings depuis le store et construit les patterns RegExp
     * pour les URLs internes, externes et safelinks.
     */
    reloadSettings() {
        showWindowFrame = settings.get("showWindowFrame");
        // Use account-specific URL if configured, fall back to global setting
        mainMailServiceUrl = this.accountConfig?.url || settings.get("urlMainWindow");
        deeplinkUrls = settings.get("urlsInternal");
        mailServicesUrls = settings.get("urlsExternal");
        safelinksUrls = settings.get("safelinksUrls");
        this.focusMode = settings.get("focusMode") || false;
        this.accentColor = settings.get("accentColor") || '#0078d4';

        logger.info("Loaded settings", {
            mainMailServiceUrl, deeplinkUrls, mailServicesUrls, safelinksUrls,
        });

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        this.safelinksPattern = new RegExp(safelinksUrls.map(escapeRegex).join("|"));
        this.deeplinkPattern = new RegExp(deeplinkUrls.map(escapeRegex).join("|"));
        this.mailServicesPattern = new RegExp(mailServicesUrls.map(escapeRegex).join("|"));
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
            currentZoomIndex = Math.min(currentZoomIndex + 1, ZOOM_LEVELS.length - 1);
        } else if (action === 'out') {
            currentZoomIndex = Math.max(currentZoomIndex - 1, 0);
        } else if (action === 'reset') {
            currentZoomIndex = 2;
        } else if (typeof action === 'number') {
            this.win.webContents.setZoomFactor(action);
            return;
        }
        this.win.webContents.setZoomFactor(ZOOM_LEVELS[currentZoomIndex]);
        logger.info(`Zoom set to ${ZOOM_LEVELS[currentZoomIndex]}`);
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
     * @returns {boolean} true si la notification a été envoyée
     */
    sendUbportsNotification(title, body) {
        const notifyPath = this.getNotifyBinaryPath();
        if (!notifyPath) return false;
        try {
            const args = body ? [title, body] : [title];
            const child = spawn(notifyPath, args, {detached: true, stdio: 'ignore'});
            child.unref();
            child.on('error', (err) => {
                logger.error('Failed to spawn notify binary:', err);
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
                        "default-src 'self' https://outlook.office.com https://*.office.com " +
                        "https://*.office365.com https://*.live.com https://*.microsoft.com " +
                        "https://*.msauth.net https://*.msocdn.com https://*.sharepoint.com; " +
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://outlook.office.com " +
                        "https://*.office.com https://*.office365.com https://*.live.com https://*.microsoft.com; " +
                        "style-src 'self' 'unsafe-inline' https://outlook.office.com https://*.office.com; " +
                        "img-src 'self' data: https: blob:; " +
                        "connect-src 'self' https://outlook.office.com wss://*.office.com " +
                        "https://*.live.com https://*.office365.com https://*.sharepoint.com; " +
                        "font-src 'self' https://outlook.office.com https://*.office.com data:; " +
                        "media-src 'self' https: blob:; " +
                        "frame-src 'self' https://outlook.office.com https://*.office.com;"
                    ]
                }
            });
        });
    }

    // --- Dark mode (amélioré) ---

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
            /* Hide reading pane header actions (keep essential) */
            [class*="commandBar"] button:not([aria-label*="Répondre"]):not([aria-label*="Reply"]):not([aria-label*="Transférer"]):not([aria-label*="Forward"]) {
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
                content: "Mode lecture";
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
        this.splashWindow.loadFile(splashPath);

        // Safety timeout: close splash after 15s even if dom-ready never fires
        this.splashTimeout = setTimeout(() => this.closeSplashWindow(), 15000);
    }

    closeSplashWindow() {
        if (this.splashTimeout) {
            clearTimeout(this.splashTimeout);
            this.splashTimeout = null;
        }
        if (this.splashWindow && !this.splashWindow.isDestroyed()) {
            this.splashWindow.close();
            this.splashWindow = null;
        }
    }

    createWindow() {
        this.win = new BrowserWindow({
            x: 100, y: 100,
            width: 1400, height: 900,
            frame: showWindowFrame,
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

        this.win.loadURL(mainMailServiceUrl, {userAgent: customUserAgent});

        this.win.webContents.on('did-finish-load', () => {
            loginPage++;
            if (loginPage < 2) logger.info("LOGIN WINDOW");
        });

        fs.writeFile(LOGIN_FLAG_FILE, 'notif!', err => { if (err) logger.error(err); });
    }

    setupLoadingIndicators() {
        this.win.webContents.on('did-start-loading', () => {
            this.win.setProgressBar(0.3);
        });
        this.win.webContents.on('did-stop-loading', () => {
            this.win.setProgressBar(-1);
        });
    }

    setupContextMenu() {
        const isDev = this.isDev;
        this.win.webContents.on("context-menu", (_event, params) => {
            const menuTemplate = [];
            if (params.isEditable) {
                menuTemplate.push(
                    {label: "Undo", role: "undo"},
                    {label: "Redo", role: "redo"},
                    {type: "separator"},
                    {label: "Cut", role: "cut", enabled: params.editFlags.canCut},
                    {label: "Copy", role: "copy", enabled: params.editFlags.canCopy},
                    {label: "Paste", role: "paste", enabled: params.editFlags.canPaste},
                    {type: "separator"},
                    {label: "Select All", role: "selectAll"}
                );
            } else {
                if (params.selectionText) {
                    menuTemplate.push({label: "Copy", role: "copy"});
                }
                if (params.linkURL) {
                    if (menuTemplate.length > 0) menuTemplate.push({type: "separator"});
                    menuTemplate.push(
                        {
                            label: "Open Link in Browser",
                            click: () => { this.openExternalLink(params.linkURL); },
                        },
                        {
                            label: "Copy Link Address",
                            click: () => { clipboard.writeText(params.linkURL); },
                        }
                    );
                }
                if (params.selectionText || params.pageURL) {
                    if (menuTemplate.length > 0) menuTemplate.push({type: "separator"});
                    menuTemplate.push({label: "Select All", role: "selectAll"});
                }
            }
            if (isDev) {
                if (menuTemplate.length > 0) menuTemplate.push({type: "separator"});
                menuTemplate.push({
                    label: "Inspect Element",
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
    }

    /**
     * Traite une demande de notification depuis le renderer.
     * @param {string} title
     * @param {string} body
     * @param {string|null} icon
     */
    handleNotification(title, body, icon) {
        fs.writeFile(NOTIF_FLAG_FILE, 'notif!', err => { if (err) logger.error(err); });

        // Relay to Ubuntu Touch notifications (D-Bus Postal / Lomiri)
        const sentToUbports = this.sendUbportsNotification(title, body);
        if (sentToUbports) return;

        // Fallback: Electron native notification (desktop)
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
        // Insert styles and observer on first DOM ready
        this.win.webContents.on("dom-ready", () => {
            this.closeSplashWindow();
            this.injectStyles();
            this.addUnreadNumberObserver();
            this.injectGestures();

            // Apply dark mode if system prefers it
            if (nativeTheme.shouldUseDarkColors) {
                this.win.webContents.executeJavaScript(
                    `document.documentElement.classList.add('dark-mode');`
                );
            }

            if (!initialMinimization.domReady) {
                this.win.show();
            }
        });

        // Re-inject on SPA navigation (Outlook is a single-page app)
        this.win.webContents.on('did-navigate-in-page', () => {
            this.injectStyles();
            this.addUnreadNumberObserver();
            this.injectGestures();
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
        this.win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            // Network-related error codes
            const networkErrors = [-3, -100, -101, -102, -105, -106, -109, -118, -121, -137, -323];
            if (networkErrors.includes(errorCode) && !validatedURL.startsWith('file://')) {
                logger.warn(`Network error ${errorCode}: ${errorDescription} — showing offline overlay`);
                this.showOfflineOverlay();
                this.startConnectivityMonitor();
            }
        });
    }

    showOfflineOverlay() {
        if (!this.win || this.win.isDestroyed()) return;
        this.isOffline = true;

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
                        <h1 style="font-size:24px;font-weight:300;margin-bottom:12px;">Pas de connexion</h1>
                        <p style="font-size:16px;opacity:0.7;margin-bottom:32px;line-height:1.5;">
                            UToutlook Mail n\\'arrive pas à se connecter.<br>
                            Vérifiez votre connexion Internet.
                        </p>
                        <div style="width:24px;height:24px;border:2px solid rgba(255,255,255,0.2);
                             border-top-color:#0078d4;border-radius:50%;
                             animation:utoutlook-spin 0.8s linear infinite;"></div>
                        <div style="margin-top:16px;font-size:13px;opacity:0.5;">Reconnexion automatique...</div>
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
        this.sendUbportsNotification('UToutlook Mail', 'Connexion Internet perdue');
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
                    logger.info('Connectivity restored — reloading');
                    clearInterval(this.connectivityTimer);
                    this.connectivityTimer = null;
                    this.hideOfflineOverlay();
                    this.sendUbportsNotification('UToutlook Mail', 'Connexion rétablie');
                    this.win.reload();
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
        if (!showWindowFrame) {
            this.cssKeys.noFrame = await this.win.webContents.insertCSS(getClientFile("no-frame.css"));
        }
        if (nativeTheme.shouldUseDarkColors) {
            this.cssKeys.dark = await this.win.webContents.insertCSS(this.getDarkModeCSS());
        }
        if (this.focusMode) {
            this.cssKeys.focus = await this.win.webContents.insertCSS(this.getFocusModeCSS());
        }
        if (this.accentColor && this.accentColor !== '#0078d4') {
            this.cssKeys.accent = await this.win.webContents.insertCSS(this.getAccentColorCSS(this.accentColor));
        }
    }

    addUnreadNumberObserver() {
        this.win.webContents.executeJavaScript(
            getClientFile("unread-number-observer.js")
        );
    }

    injectGestures() {
        try {
            this.win.webContents.executeJavaScript(
                getClientFile("gestures.js")
            );
        } catch (err) {
            // gestures.js may not exist yet, ignore
        }
    }

    /**
     * Bascule la visibilité de la fenêtre (show/hide).
     */
    toggleWindow() {
        if (this.win.isVisible()) {
            this.win.hide();
        } else {
            initialMinimization.domReady = false;
            this.show();
        }
    }

    /**
     * Recharge la page Outlook.
     */
    reloadWindow() {
        initialMinimization.domReady = false;
        this.win.reload();
    }

    /**
     * Affiche la fenêtre principale (restore si minimisée).
     * Extrait également le token fb_dtsg de la page.
     */
    show() {
        initialMinimization.domReady = false;
        if (this.win.isMinimized()) {
            this.win.restore();
        } else {
            this.win.show();
        }
        this.win.focus();

        // Extract fb_dtsg token from the page
        this.win.webContents.executeJavaScript(
            `(() => { const el = document.querySelector('input[name="fb_dtsg"]'); return el ? el.value : null; })()`,
            (result) => {
                if (result) logger.debug("fb_dtsg token retrieved");
            }
        );
    }
}

export default MailWindowController
