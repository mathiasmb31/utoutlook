import {app, BrowserWindow, dialog, ipcMain, Menu, shell, clipboard, Notification, nativeImage, nativeTheme, screen, session, powerMonitor, net} from 'electron';
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
    DATA_DIR,
    INIT_FLAG_FILE,
    LOGIN_FLAG_FILE,
    NOTIF_FLAG_FILE,
    ICON_PATH,
    markCleanExit,
    ROTATION_RELAUNCH_FILE,
    RENDER_MODE_FILE,
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
        this.loginPageLoadTimes = []; // v3.3.59: timestamps of login page loads for 2FA loop detection
        this.redirectLoopDetected = false;
        this.loginHintIntercepts = 0; // count of login_hint redirects intercepted
        this.loopDetectorRetries = 0; // count of loop detector activations (max 3)
        this.mfaLoopDetected = false; // v3.3.59: 2FA loop already handled
        this.lastMailUrl = null; // v3.3.67: dernière URL de boîte mail chargée (sans ?code=) — cible de reprise après boucle 2FA
        this.lastMailPageTime = 0; // v4.0.41: timestamp de la dernière page mail atteinte — protège contre les rechargements agressifs qui perdent le token
        this.authTokenJumped = false; // v4.0.43: saut direct page mail après détection du jeton (évite de le déclencher en boucle)
        this.authStartLoadTimes = []; // v3.3.67: chargements des pages /authorize|select_account (détection boucle KMSI)
        this.inPageAuthEvents = []; // v4.0.38: navigations in-page récentes {t, kind: 'post'|'authstart'} pour la détection de boucle 2FA SPA
        this.pageRangeErrors = []; // v3.3.74: timestamps des RangeError « Maximum call stack » de la page
        this.sessionClearedForLoop = false; // v3.3.74: clear session déjà tenté une fois
        this.currentZoomIndex = 2; // start at 1.0
        this.initialMinimization = { domReady: false };

        // v3.3.21: CSS keys are per-window now (win.__utoutlookCssKeys), base CSS only.
        this.lastNotifiedUnread = 0;
        this.cacheWatcher = null;
        this.triggerTimers = new Map(); // debounce timers for file triggers
        this.splashWindow = null;
        this.splashClosed = false; // true once splash has been dismissed (URL match or timeout)
        this.cookieFlushInterval = null; // periodic cookie flush to disk
        this.observerHealthCheck = null; // periodic observer connectivity check
        this.serverMonitor = null; // v4.0.3: periodic real server reachability check
        this.serverFailCount = 0; // v4.0.3: consecutive failed server checks
        this.serverWasUnreachable = false; // v4.0.3: server overlay currently shown
        this.observerWasActive = false; // true once observer connected at least once
        // v4.0.95: blocage CIBLÉ des reloads automatiques pendant l'action du
        // bouton « Recharger les messages ». Ne PAS réutiliser lastRotationReload
        // (servi par le détecteur de pivot) : un clic ne doit pas désactiver la
        // gestion de rotation pendant 20 s.
        this.autoReloadBlockedUntil = 0;
        // Multi-account: each account has its own config and session partition
        this.accountConfig = accountConfig;
        this.accountId = accountConfig?.id || 'default';
        this.accountName = accountConfig?.name || 'Compte principal';
        this.sessionPartition = accountConfig?.partition || 'persist:utoutlook-default';
        this.unreadCount = 0;
        // v4.1.0 (revue B8): registre des listeners pour destroy().
        this._listeners = [];
        this._ipcHandleChannels = ['get-render-mode', 'set-render-mode', 'first-install'];
        this.init();
        // Check both command-line flag and settings for initial minimization
        const hasMinimizedFlag = (global.cmdLine || []).indexOf("--minimized") !== -1;
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
        // v4.1.0 (revue E27): borne les facteurs reçus sur le socket non authentifié.
        if (typeof action === 'number') action = Math.min(2, Math.max(0.5, action));
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

    // v3.3.25: reading font scale steps (message body text), independent of global zoom
    static READING_FONT_STEPS = [0.9, 1.0, 1.1, 1.25, 1.4];

    handleReadingFontCommand(action) {
        const steps = MailWindowController.READING_FONT_STEPS;
        let scale = settings.get('readingFontScale') || 1.0;
        let idx = steps.indexOf(scale);
        if (idx === -1) idx = 1;
        if (action === 'in') idx = Math.min(idx + 1, steps.length - 1);
        else if (action === 'out') idx = Math.max(idx - 1, 0);
        else if (action === 'reset') idx = 1;
        else if (typeof action === 'number') { scale = action; settings.set('readingFontScale', scale); this.injectStyles().catch(() => {}); logger.info(`Reading font scale set to ${scale}`); return; }
        scale = steps[idx];
        settings.set('readingFontScale', scale);
        this.injectStyles().catch(() => {});
        logger.info(`Reading font scale: ${scale}`);
    }

    /**
     * Insère du texte dans le champ actif de la page (clavier virtuel).
     * @param {string} text - Texte à insérer
     */
    insertText(text) {
        if (!this.win || this.win.isDestroyed()) return;
        // v3.3.48: en Wayland natif (WAYLAND_DISPLAY set, plus de forçage X11),
        // webContents.insertText (chemin XIM/X11) ne dépose rien. Fallback :
        // insérer dans le champ focusé via execCommand → vrai événement input.
        if (process.env.WAYLAND_DISPLAY) {
            this.win.webContents.executeJavaScript(
                `(()=>{var ae=document.activeElement;` +
                `if(ae&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable)){` +
                `ae.focus();document.execCommand('insertText',false,${JSON.stringify(text)});` +
                `return ae.value!==undefined?String(ae.value).length:-1;}return null;})()`
            ).catch(() => {});
            return;
        }
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
        // v3.3.23: if CACHE_DIR is removed (app reset), fs.watch emits 'error' →
        // uncaughtException. Log and recreate instead of crashing.
        this.cacheWatcher.on('error', (err) => {
            logger.warn('cacheWatcher error (CACHE_DIR removed?):', err.message);
            try { fs.mkdirSync(CACHE_DIR, {recursive: true}); } catch (e) { /* ignore */ }
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

        // v4.0.45: sauvegarde proactive du jeton d'auth dans un fichier local
        // (DATA_DIR/auth-token.json) dès qu'il est posé — réinjecté au démarrage
        // si Chromium l'a perdu (cookie de session non persisté). Le fichier est
        // local au téléphone (AppArmor confine l'app à son CONFIG_DIR).
        const ses = session.fromPartition(this.sessionPartition);
        const AUTH_TOKEN_FILE = path.join(DATA_DIR, 'auth-token.json');
        const AUTH_COOKIE_NAMES = /^(__Host-)?MSAAUTH(P)?$|ESTSAUTH(PERSIST)?$/i;
        try { fs.mkdirSync(DATA_DIR, {recursive: true}); } catch (e) { /* ignore */ }

        // Restaurer les tokens sauvegardés au démarrage (avant le 1er loadURL)
        this.restoreAuthToken = async () => {
            try {
                // v4.0.54: nettoyer d'abord les cookies non-essentiels accumulés par les
                // anciens syncs (390 cookies = 11,7 Ko → header Cookie > 8 Ko → 431).
                const all = await ses.cookies.get({});
                // v4.0.57: liste élargie aux cookies de session du flux Microsoft
                // (MSPAuth/NAP/ANON/…) — ne garder que MSAAUTH/ESTSAUTH supprimait
                // des cookies nécessaires et cassait la suite du login
                const CORE = /^(__Host-)?MSAAUTH(P)?$|ESTSAUTH|esctx|fptctx2?|PPLState|ChainedAuthProbe|MSPAuth|MSPProf|NAP|ANON|WLSSC|MSPOK|OParams|uaid|ClientId|brcap|buid|fpc|msal\.cache|stsservicecookie/i;
                let cleaned = 0;
                for (const c of all) {
                    const d = (c.domain || '').toLowerCase();
                    const isMs = d.includes('live.com') || d.includes('microsoft') || d.includes('office.com') || d.includes('outlook');
                    if (isMs && !CORE.test(c.name)) {
                        const url = `${c.secure ? 'https' : 'http'}://${d.replace(/^\./, '')}${c.path || '/'}`;
                        await ses.cookies.remove(url, c.name).catch(() => {});
                        cleaned++;
                    }
                }
                // v4.0.60: dédupliquer esctx-<id> / OParams (un par tentative de
                // login) — ne garder que le dernier par famille et par domaine
                const seenFam = new Map();
                for (const c of all) {
                    const fam = /^(esctx-.+|OParams\d*)$/i.exec(c.name || '');
                    if (!fam) continue;
                    const key = (fam[1].startsWith('esctx') ? 'esctx' : 'OParams') + '@' + (c.domain || '');
                    if (seenFam.has(key)) {
                        const old = seenFam.get(key);
                        const u = `${old.secure ? 'https' : 'http'}://${(old.domain || '').replace(/^\./, '')}${old.path || '/'}`;
                        await ses.cookies.remove(u, old.name).catch(() => {});
                        cleaned++;
                    }
                    seenFam.set(key, c);
                }
                if (cleaned > 0) logger.info(`v4.0.60: ${cleaned} cookies non-essentiels/dupliqués nettoyés au démarrage`);
                await ses.cookies.flushStore().catch(() => {});

                if (!fs.existsSync(AUTH_TOKEN_FILE)) return;
                let saved = JSON.parse(fs.readFileSync(AUTH_TOKEN_FILE, 'utf8'));
                // v4.0.46: format = tableau de cookies (rétrocompat: objet unique)
                if (!Array.isArray(saved)) saved = [saved];
                if (saved.length === 0 || !saved[0].name) return;
                // v4.0.52: domaines ESSENTIELS uniquement — restaurer sur 9 domaines
                // créait un header Cookie énorme (>8 Ko) que les serveurs Microsoft
                // rejetaient (431 Request Header Fields Too Large → "bad request").
                // v4.0.60: ne PAS référencer `entry` ici (TDZ — la restauration
                // throwait à chaque démarrage depuis v4.0.52 et le token n'était
                // jamais restauré). Le domaine propre à chaque entrée est déjà
                // ajouté dans la boucle ci-dessous.
                const domains = ['login.live.com', '.live.com',
                                 'login.microsoftonline.com', '.cloud.microsoft'];
                let restored = 0;
                // v4.0.53: ne restaurer QUE les cookies d'auth essentiels — restaurer
                // les 30 cookies × 4 domaines = header Cookie > 11 Ko, rejeté par
                // Microsoft (431 Header Too Long) → la requête 2FA n'est jamais envoyée.
                // v4.0.58: prefix match — esctx-<id> a un suffixe aléatoire
                const CORE_AUTH = /^(__Host-)?MSAAUTH(P)?|ESTSAUTH|esctx/i;
                for (const entry of saved) {
                    if (!entry.name || !entry.value) continue;
                    if (!CORE_AUTH.test(entry.name)) continue; // ignorer esctx, fptctx, tracking, etc.
                    for (const domain of new Set([...domains, entry.domain].filter(Boolean))) {
                        try {
                            const host = domain.replace(/^\./, '');
                            const isHostOnly = entry.hostOnly && domain === entry.domain;
                            const cookieOpts = {
                                url: `https://${host}${entry.path || '/'}`,
                                name: entry.name,
                                value: entry.value,
                                path: entry.path || '/',
                                secure: true,
                                httpOnly: entry.httpOnly || false,
                                sameSite: 'no_restriction',
                                expirationDate: entry.expirationDate || (Math.floor(Date.now() / 1000) + 365 * 86400),
                            };
                            // v4.0.49: __Host- prefix exige PAS d'attribut domain (host-only)
                            if (!isHostOnly && !entry.name.startsWith('__Host-')) {
                                cookieOpts.domain = domain;
                            } else if (entry.name.startsWith('__Host-')) {
                                // __Host- : pas de domain attribute, juste l'URL host
                                delete cookieOpts.domain;
                            } else {
                                cookieOpts.domain = domain;
                            }
                            await ses.cookies.set(cookieOpts);
                            restored++;
                        } catch (e) { /* domaine peut rejeter — ignorer */ }
                    }
                }
                logger.info(`v4.0.46: ${saved.length} tokens restaurés depuis auth-token.json (${restored} cookies posés)`);
                await ses.cookies.flushStore().catch(() => {});
                await this.syncCookiesToLiveCom().catch(() => {});
            } catch (e) { logger.warn('v4.0.46: restore token failed:', e.message); }
        };

        this._on(ses.cookies, 'changed', (_event, cookie, _cause, removed) => {
            if (removed) return;
            const name = cookie.name || '';
            const domain = (cookie.domain || '').toLowerCase();
            // v4.0.46: sauvegarder TOUS les cookies de session Microsoft (pas seulement
            // MSAAUTH) — la session complète = MSAAUTH + ESTSAUTH + esctx + fptctx + PPLState + etc.
            const isAuthCookie = AUTH_COOKIE_NAMES.test(name) ||
                /^(esctx|fptctx|PPLState|ChainedAuthProbe|MSPAuth|MSPProf|NAP|ANON|WLSSC|MSPOK|OParams|uaid|ClientId|brcap|buid|fpc|msal\.cache)/i.test(name);
            if (!isAuthCookie) return;
            if (!domain.includes('live.com') && !domain.includes('microsoft') &&
                !domain.includes('office.com') && !domain.includes('outlook')) return;
            // v4.0.58: un cookie esctx-<id> (ou OParams) est posé À CHAQUE tentative
            // de login (~800 B chacun) et ils s'accumulent sans jamais être
            // supprimés → jar de 28 Ko sur .live.com → header Cookie ingérable.
            // Ne garder que le PLUS RÉCENT par famille et par domaine.
            if (/^(esctx-.+|OParams\d*)$/i.test(name)) {
                (async () => {
                    try {
                        const fam = name.startsWith('esctx') ? /^esctx-/i : /^OParams/i;
                        const same = await ses.cookies.get({ domain: cookie.domain });
                        for (const c of same) {
                            if (c.name === cookie.name || !fam.test(c.name)) continue;
                            const u = `${c.secure ? 'https' : 'http'}://${(c.domain || '').replace(/^\./, '')}${c.path || '/'}`;
                            await ses.cookies.remove(u, c.name).catch(() => {});
                        }
                    } catch (e) { /* ignore */ }
                })();
            }
            // Sauvegarder dans un fichier JSON (liste de cookies) — seulement depuis login.live.com
            // (évite de sauvegarder les copies sync sur autres domaines)
            if (domain === 'login.live.com' || domain === '.live.com') {
                try {
                    let tokens = [];
                    if (fs.existsSync(AUTH_TOKEN_FILE)) {
                        try { tokens = JSON.parse(fs.readFileSync(AUTH_TOKEN_FILE, 'utf8')); } catch (e) { tokens = []; }
                    }
                    if (!Array.isArray(tokens)) tokens = [];
                    // Mettre à jour ou ajouter ce cookie
                    const idx = tokens.findIndex(t => t.name === name);
                    const entry = {
                        name: name, // v4.0.49: garder le préfixe __Host- original — Microsoft exige __Host-MSAAUTH host-only
                        value: cookie.value,
                        domain: cookie.domain,
                        hostOnly: !cookie.domain || !cookie.domain.startsWith('.'), // host-only si pas de domain explicite
                        path: cookie.path || '/',
                        httpOnly: cookie.httpOnly || false,
                        expirationDate: cookie.expirationDate || (Math.floor(Date.now() / 1000) + 365 * 86400),
                        savedAt: new Date().toISOString(),
                    };
                    if (idx >= 0) tokens[idx] = entry; else tokens.push(entry);
                    fs.writeFileSync(AUTH_TOKEN_FILE, JSON.stringify(tokens));
                } catch (e) { logger.warn('v4.0.46: sauvegarde token failed:', e.message); }
            }
            if (AUTH_COOKIE_NAMES.test(name)) {
                logger.info(`v4.0.47: auth cookie détecté (${name} sur ${domain}) — sauvegarde + flush`);
            }
            ses.cookies.flushStore().catch(() => {});
            this.lastMailPageTime = Date.now();
            // v4.0.47: PLUS de saut direct ici — un MSAAUTH intermédiaire est posé
            // PENDANT le flux de login (avant 2FA), sauter à ce moment interrompt
            // le login et crée une boucle infinie (mail → authorize → post.srf → …).
            // On se contente de sauvegarder + flusher ; la page mail sera atteinte
            // naturellement à la fin du flux, et did-finish-load flushera alors.
        });
        logger.info('v4.0.45: watcher de jeton d\'auth actif + sauvegarde fichier local');
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
                // v3.3.79: ne JAMAIS recopier stsservicecookie — sa présence sur
                // login.microsoftonline.com déclenche le resume SSO silencieux
                // « Trying to sign you in » dont la vue plante en boucle (RangeError)
                if (cookie.name.toLowerCase() === 'stsservicecookie') continue;
                // v4.0.55: ne recopier QUE les cookies d'auth essentiels — copier les
                // ~30 cookies (tracking inclus) × 9 domaines = header Cookie > 8 Ko
                // rejeté par Microsoft (431 Header Too Long) après la validation 2FA.
                const CORE_SYNC = /^(__Host-)?MSAAUTH(P)?$|ESTSAUTH|esctx|fptctx2?|PPLState|msal\.cache/i;
                if (!CORE_SYNC.test(cookie.name)) continue;
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
                    // v3.3.15: also share to login.live.com — the SPA goes straight
                    // to login.microsoftonline.com and never passes through
                    // login.live.com, so the persistent auth cookie
                    // (__Host-MSAAUTHP on login.live.com) was never presented there
                    // → the pick-account page showed no account.
                    targets.push('.live.com', 'outlook.live.com', 'login.live.com');
                } else if (domain === '.msauth.net' || domain === '.msocdn.com' ||
                           domain === '.msftauth.net' || domain === '.msecnd.net') {
                    targets.push('.live.com', 'outlook.live.com', 'login.live.com');
                } else if (domain === 'login.live.com') {
                    // login.live.com cookies → outlook.live.com + login.microsoftonline.com
                    // (the authorize endpoint only receives its own-domain cookies)
                    targets.push('outlook.live.com', 'login.microsoftonline.com', '.microsoftonline.com');
                }
                // v3.3.11: Outlook now serves mail from outlook.cloud.microsoft.
                // Session/auth cookies must also exist on .cloud.microsoft, or
                // Microsoft does not recognize the session there and falls back
                // to the "we found an account you can use" page (select_account).
                if (domain.includes('microsoft') || domain.includes('office') ||
                    domain.includes('live.com') || domain.includes('msauth') ||
                    domain.includes('msocdn') || domain.includes('msecnd') ||
                    domain.includes('msftauth')) {
                    // v3.3.15: the authorize page lives on login.microsoftonline.com
                    // and only receives its own-domain cookies — share there too,
                    // otherwise the pick-account page shows no known account.
                    targets.push('.cloud.microsoft', 'outlook.cloud.microsoft',
                                 'login.microsoftonline.com', '.microsoftonline.com');
                }
                for (const newDomain of targets) {
                    const host = newDomain.replace(/^\./, '');
                    const url = `https://${host}${cookie.path || '/'}`;
                    // v3.3.13: __Host-/__Secure- prefixed cookies CANNOT be set
                    // with a domain attribute — Chromium rejects them
                    // ("invalid __Host- or __Secure- prefix"), so session cookies
                    // like __Host-MSAAUTH were silently NOT copied and the login
                    // page lost the account ("compte que vous pouvez utiliser ici"
                    // with no user shown). Strip the prefix for the copy: the
                    // target domain then reads the unprefixed name.
                    const copyName = cookie.name.replace(/^__(?:Host|Secure)-/i, '');
                    try {
                        await ses.cookies.set({
                            url,
                            name: copyName,
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
                    } catch (e) {
                        // v3.3.22: HttpOnly overwrite refusals are expected for tracking
                        // cookies (MSFPC/NAP/MCN…) — debug level, not warn (log spam).
                        logger.debug(`Cookie copy failed: ${cookie.name} → ${newDomain}: ${e.message}`);
                    }
                }
            }
            await ses.cookies.flushStore();
            logger.info(`Synced ${copied} cookies → live.com / cloud.microsoft (SameSite=None)`);
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
    /**
     * v4.0.78: watchdog « liste vide » — contrôle toutes les 8 s ; si page mail
     * et MessageList sans aucune ligne pendant 2 contrôles consécutifs (~16 s),
     * recharger la page (garde-fou: max 1 reload / 60 s). Un simple querySelector
     * par tick, coût négligeable. Couvre pivot, refresh et chargement incomplet.
     */
    startListEmptyWatchdog() {
        this.listEmptyCount = 0;
        this.lastListReload = 0;
        this.listWatchdog = setInterval(async () => {
            if (!this.win || this.win.isDestroyed()) return;
            try {
                const url = this.win.webContents.getURL();
                if (!/outlook\.(live|office|office365|cloud\.microsoft)\.com\/mail/.test(url)) { this.listEmptyCount = 0; return; }
                const empty = await this.win.webContents.executeJavaScript(`
                    (() => {
                        // v4.0.94: ne JAMAIS conclure "vide" pendant le chargement —
                        // la liste est à 0 px tant que readyState != complete, ce
                        // qui provoquait des reloads en boucle (liste jamais
                        // réaffichée, même en portrait).
                        if (document.readyState !== 'complete') return false;
                        const ml = document.querySelector('[data-app-section="MessageList"]');
                        if (!ml) return false; // pas de liste du tout = autre vue
                        // v4.0.94: une liste rendue 0x0 (offsetParent null après un
                        // pivot) doit compter comme VIDE — avant on retournait false
                        // ("autre vue") et le watchdog ne réagissait jamais.
                        if (!ml.offsetParent && ml.getBoundingClientRect().height === 0) return true;
                        if (!ml.offsetParent) return false; // masquée mais hauteur non nulle = autre vue
                        // v4.0.78: les lignes Outlook sont des role="option" dans un
                        // listbox (pas role="listitem" !) — ancien sélecteur = faux
                        // positifs "liste vide" et reloads en boucle.
                        // v4.0.81: ne compter que les lignes VRAIMENT visibles (hauteur > 0)
                        return Array.from(ml.querySelectorAll('[role="option"], [role="listitem"], [class*="listItem"]')).filter(o => o.getBoundingClientRect().height > 0).length === 0;
                    })()
                `);
                // v4.0.78: le reload auto ne se fait QU'après une rotation récente
                // (< 30 s) — la liste vide est systématique au pivot ; hors rotation
                // (chargement initial, refresh) on ne touche à rien.
                const rotatedRecently = this.lastRotationTime && (Date.now() - this.lastRotationTime < 30000);
                if (empty && rotatedRecently) {
                    this.listEmptyCount++;
                    if (this.listEmptyCount === 1) {
                        // v4.0.78: prévenir l'utilisateur avant le reload automatique
                        logger.info('v4.0.78: liste vide détectée — avertissement, reload au prochain contrôle si toujours vide');
                        this.showToast(t('overlay.listEmptyReload'));
                    }
                    if (this.listEmptyCount >= 2) {
                        const now = Date.now();
                        if (!this.lastListReload || now - this.lastListReload > 60000) {
                            this.lastListReload = now;
                            this.listEmptyCount = 0;
                            logger.warn('v4.0.78: liste vide persistante sur la page mail — reload de la page');
                            this.win.webContents.reload();
                        }
                    }
                } else {
                    this.listEmptyCount = 0;
                }
                if (!empty || !rotatedRecently) this.listEmptyCount = 0;
            } catch (e) { /* ignore */ }
        }, 8000);
    }

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
        // v4.0.51: domaines CDN Microsoft complts — c.s-microsoft.com (fonts),
        // aspnetcdn/ajax (jQuery), gfx.ms. Sans eux la page de login craqute
        // (Uncaught ReferenceError: jQuery is not defined) et retombe en boucle.
        const MS_CDN = "https://*.s-microsoft.com https://*.aspnetcdn.com https://ajax.microsoft.com " +
                       "https://*.gfx.ms https://res.public.onecdn.static.microsoft " +
                       "https://*.cdn.office.net https://*.onecdn.static.microsoft https://*.msocdn.com " +
                       "https://*.msecnd.net https://*.msftauth.net https://*.msauth.net " +
                       "https://*.live.net https://*.bing.com https://*.github.com https://*.githubassets.com";
        const MS_BASE = "https://outlook.com https://*.outlook.com https://outlook.office.com https://*.office.com " +
                        "https://*.office365.com https://*.live.com https://*.microsoft.com " +
                        "https://*.microsoftonline.com https://*.cloud.microsoft https://*.sharepoint.com";
        ses.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self' " + MS_BASE + " " + MS_CDN + "; " +
                        // script-src must include ALL domains that serve JS, not just
                        // default-src — otherwise Outlook boot JS from CDNs is blocked
                        // (olkerror.html?esrc=NoBootJs). blob: needed for web workers.
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: " + MS_BASE + " " + MS_CDN + "; " +
                        "style-src 'self' 'unsafe-inline' " + MS_BASE + " " + MS_CDN + "; " +
                        "img-src 'self' data: https: blob:; " +
                        "connect-src 'self' https: wss:; " +
                        // v4.0.51: font-src permissif (https:) — Microsoft sert les fonts
                        // depuis c.s-microsoft.com qui change souvent de sous-domaine
                        "font-src 'self' data: https:; " +
                        "media-src 'self' https: blob:; " +
                        "frame-src 'self' " + MS_BASE + " " + MS_CDN + "; " +
                        "worker-src 'self' blob:;"
                    ]
                }
            });
        });
    }

    // --- Cookie header guard (v4.0.56) ---
    // Microsoft rejette toute requête dont le header Cookie dépasse ~8 Ko avec
    // « 431 Header field too long » (« bad request »). Pendant le flux de login,
    // le jar accumule des centaines de cookies sur .live.com / .microsoftonline.com
    // et ils sont TOUS renvoyés à chaque sous-domaine (outlook.live.com inclus) —
    // le nettoyage au démarrage (v4.0.54) ne suffit pas, le jar se remplit à
    // chaque login, notamment après la validation 2FA + « rester connecté ».
    // Ce garde-fou réécrit le header Cookie à la volée (onBeforeSendHeaders) :
    // pour les domaines Microsoft, si le header est trop gros, il est réduit aux
    // seuls cookies d'auth essentiels. Le flux de login normal (< 6,5 Ko) n'est
    // jamais touché.
    setupCookieHeaderGuard() {
        const ses = session.fromPartition(this.sessionPartition);
        // v4.0.57: deux niveaux. EXTENDED = tous les cookies de session dont le
        // flux de login Microsoft a besoin (sinon la requête 2FA n'est plus
        // envoyée — régression v4.0.56 qui ne gardait que CORE). CORE_AUTH =
        // repli ultime si même EXTENDED dépasse le seuil.
        const EXTENDED = /^(__Host-|__Secure-)?(MSAAUTH|MSAAUTHP|ESTSAUTH|ESTSAUTHPERSIST|esctx|fptctx2?|PPLState|ChainedAuthProbe|MSPAuth|MSPProf|NAP|ANON|WLSSC|MSPOK|OParams|uaid|ClientId|brcap|buid|fpc|msal\.cache|stsservicecookie)/i;
        // v4.0.58: prefix match (pas d'ancre $) — les vrais noms ont un suffixe
        // aléatoire (esctx-Ab3xY…, OParams1) et l'ancre $ les ratait tous
        const CORE_AUTH = /^(__Host-|__Secure-)?(MSAAUTH|MSAAUTHP|ESTSAUTH|ESTSAUTHPERSIST|esctx|fptctx2?|PPLState|msal\.cache|stsservicecookie)/i;
        const MAX_COOKIE_HEADER = 7500; // rester sous la limite serveur de 8 Ko (431) avec marge
        const isMsHost = (h) => h.includes('live.com') || h.includes('microsoft') ||
            h.includes('office.com') || h.includes('office365.com') || h.includes('outlook') ||
            h.includes('msauth.net') || h.includes('msocdn.com') || h.includes('msecnd.net') ||
            h.includes('msftauth.net') || h.includes('sharepoint.com');
        // v4.0.60: blacklist de tracking — on garde TOUT sauf le junk connu.
        // Un whitelist (même EXTENDED) risquait de retirer un cookie de session
        // dont le flux a besoin (ex: buid) et cassait la requête de sign-in/2FA.
        const JUNK = /^(__Host-|__Secure-)?(MUID|MSCC|MSFPC|MCN|MR|buid|fpc|MSPOK|brcap|ANONCHK|NAP|ANON|WLSSC)/i;
        ses.webRequest.onBeforeSendHeaders((details, callback) => {
            try {
                const host = new URL(details.url).hostname;
                if (!isMsHost(host)) return callback({});
                const headers = details.requestHeaders || {};
                const key = ('Cookie' in headers) ? 'Cookie' : ('cookie' in headers ? 'cookie' : null);
                if (!key) return callback({});
                const orig = headers[key];
                let raw = Array.isArray(orig) ? orig.join('; ') : orig;
                if (!raw || raw.length <= MAX_COOKIE_HEADER) return callback({});
                const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
                // 1) drop le junk tracking, garde tout le reste (session incluse)
                let kept = parts.filter(p => !JUNK.test(p.split('=')[0].trim()));
                // 2) si toujours trop gros, drop les plus gros non-auth d'abord
                if (kept.join('; ').length > MAX_COOKIE_HEADER) {
                    const auth = kept.filter(p => CORE_AUTH.test(p.split('=')[0].trim()));
                    const rest = kept.filter(p => !CORE_AUTH.test(p.split('=')[0].trim()))
                                    .sort((a, b) => b.length - a.length);
                    kept = [...auth];
                    let size = auth.join('; ').length;
                    for (const p of rest) {
                        if (size + p.length + 2 > MAX_COOKIE_HEADER) continue;
                        kept.push(p); size += p.length + 2;
                    }
                }
                if (kept.length === 0) {
                    const rest = { ...headers };
                    delete rest['Cookie']; delete rest['cookie'];
                    logger.warn(`v4.0.60: header Cookie (${raw.length} B) supprimé sur ${host} — 431 évité`);
                    return callback({ requestHeaders: rest });
                }
                const trimmed = kept.join('; ');
                logger.warn(`v4.0.60: header Cookie ${raw.length} B → ${trimmed.length} B sur ${host} (${parts.length - kept.length} cookies de tracking retirés, 431 évité)`);
                const newHeaders = { ...headers };
                // v4.0.60: préserver le format d'origine (Electron 44 peut passer
                // des tableaux) — écrire une string à la place d'un array perdait
                // le header et cassait la session
                newHeaders[key] = Array.isArray(orig) ? [trimmed] : trimmed;
                callback({ requestHeaders: newHeaders });
            } catch (e) {
                callback({});
            }
        });
        logger.info('v4.0.60: garde-fou header Cookie actif (anti-431, blacklist tracking)');
    }

    /**
     * Nettoie les cookies non-essentiels des domaines Microsoft quand le jar
     * devient trop gros (somme des name=value > seuil). Appelé quand la page
     * mail est atteinte — après le login le jar est plein à ras bord et chaque
     * navigation suivante risque le 431.
     */
    async cleanNonCoreCookies() {
        try {
            const ses = session.fromPartition(this.sessionPartition);
            const all = await ses.cookies.get({});
            const CORE = /^(__Host-|__Secure-)?(MSAAUTH|MSAAUTHP|ESTSAUTH|ESTSAUTHPERSIST|esctx|fptctx2?|PPLState|ChainedAuthProbe|MSPAuth|MSPProf|NAP|ANON|WLSSC|MSPOK|OParams|uaid|ClientId|brcap|buid|fpc|msal\.cache|stsservicecookie)/i;
            let size = 0;
            for (const c of all) {
                const d = (c.domain || '').toLowerCase();
                const isMs = d.includes('live.com') || d.includes('microsoft') || d.includes('office.com') ||
                    d.includes('outlook') || d.includes('msocdn') || d.includes('msecnd') ||
                    d.includes('msftauth') || d.includes('msauth');
                if (isMs) size += (c.name || '').length + (c.value || '').length + 3;
            }
            if (size <= 6000) return; // jar encore raisonnable, ne rien toucher
            let cleaned = 0;
            for (const c of all) {
                const d = (c.domain || '').toLowerCase();
                const isMs = d.includes('live.com') || d.includes('microsoft') || d.includes('office.com') ||
                    d.includes('outlook') || d.includes('msocdn') || d.includes('msecnd') ||
                    d.includes('msftauth') || d.includes('msauth');
                if (isMs && !CORE.test(c.name)) {
                    const url = `${c.secure ? 'https' : 'http'}://${d.replace(/^\./, '')}${c.path || '/'}`;
                    await ses.cookies.remove(url, c.name).catch(() => {});
                    cleaned++;
                }
            }
            // v4.0.58: dédupliquer esctx-<id> / OParams (un par tentative de login)
            // — ne garder que le dernier par famille et par domaine
            const seen = new Map();
            for (const c of all) {
                const fam = /^(esctx-.+|OParams\d*)$/i.exec(c.name || '');
                if (!fam) continue;
                const key = fam[1].startsWith('esctx') ? `esctx@${c.domain}` : `OParams@${c.domain}`;
                if (seen.has(key)) {
                    const old = seen.get(key);
                    const u = `${old.secure ? 'https' : 'http'}://${(old.domain || '').replace(/^\./, '')}${old.path || '/'}`;
                    await ses.cookies.remove(u, old.name).catch(() => {});
                    cleaned++;
                }
                seen.set(key, c);
            }
            if (cleaned > 0) {
                await ses.cookies.flushStore().catch(() => {});
                logger.info(`v4.0.58: jar trop gros (${size} B) — ${cleaned} cookies non-essentiels/dupliqués supprimés`);
            }
        } catch (e) { logger.warn('v4.0.56: cleanNonCoreCookies failed:', e.message); }
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
        // v3.3.65: .catch — page may be navigating, avoid unhandled rejection
        await this.win.webContents.executeJavaScript(
            `document.documentElement.classList.toggle('dark-mode', ${dark});`
        ).catch(() => {});
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

    /** Enregistre un listener en le mémorisant pour destroy(). */
    _on(target, event, handler) {
        if (!target || typeof target.on !== 'function') return;
        target.on(event, handler);
        this._listeners.push([target, event, handler]);
    }

    /** Retire TOUS les listeners de ce contrôleur (recréation UI). */
    destroy() {
        for (const [target, event, handler] of this._listeners) {
            try { target.removeListener(event, handler); } catch (e) { /* ignore */ }
        }
        this._listeners = [];
        for (const channel of this._ipcHandleChannels) {
            try { ipcMain.removeHandler(channel); } catch (e) { /* ignore */ }
        }
        for (const channel of ['show', 'insert-text', 'zoom', 'updateUnread', 'show-notification',
                               'toggle-focus-mode', 'set-accent-color', 'toggle-dark-mode',
                               'reload', 'reload-messages', 'quit-app']) {
            try { ipcMain.removeAllListeners(channel); } catch (e) { /* ignore */ }
        }
        for (const timer of ['cookieFlushInterval', 'observerHealthCheck', 'serverMonitor',
                             'rotationPoll', 'keyboardHealthPoll', 'surfaceHealthPoll', 'listWatchdog']) {
            if (this[timer]) { try { clearInterval(this[timer]); } catch (e) {} this[timer] = null; }
        }
        this.win = null;
        this.splashWindow = null;
        logger.info('MailWindowController destroyed (listeners removed)');
    }

    init() {
        this.reloadSettings();
        this.setupCSP();
        this.setupCookieHeaderGuard(); // v4.0.56: anti-431 — trim du header Cookie à la volée
        this.createSplashWindow();
        this.createWindow();
        this.startCookieFlush(); // v4.0.45: AVANT loadMainUrl — définit restoreAuthToken utilisé par loadMainUrl
        this.loadMainUrl();
        this.setupLoadingIndicators();
        this.setupContextMenu();
        this.setupIpcHandlers();
        this.setupWebContentsEvents();
        this.setupOrientationHandler(); // v4.0.61: fix liste vide après rotation d'écran
        this.startListEmptyWatchdog();   // v4.0.78: reload si la liste reste vide sur la page mail
        this.setupWindowOpenHandler();
        // v3.3.20: the compose window opens as a SEPARATE BrowserWindow — inject
        // the UT look & gestures there too, or it stays unstyled.
        this._on(app, 'browser-window-created', (_e, win) => {
            if (win === this.win) return;
            win.webContents.on('dom-ready', () => {
                this.injectStyles(win).catch(() => {});
                this.injectGestures(win);
            });
        });
        this.setupWindowEvents();
        this.setupPowerEvents();
        this.setupScreenEvents();
        this.setupOfflineDetection();
        this.startServerMonitor(); // v4.0.3: real in-app server reachability test
        this.startCacheWatcher();
        this.startObserverHealthCheck();
    }

    // --- Splash screen ---

    createSplashWindow() {
        const splashPath = path.resolve(__dirnameNew, '../../public/splash.html');
        if (!fs.existsSync(splashPath)) {
            // v3.3.4: without the splash there is no 30s safety timeout that
            // calls closeSplashWindow() → win.show(). Log loudly so a missing
            // splash.html in the asar is visible in the logs.
            logger.error(`splash.html NOT FOUND at ${splashPath} — no splash timeout will fire`);
            return;
        }
        logger.info('Splash window created');

        const primaryDisplay = screen.getPrimaryDisplay();
        const {width, height} = primaryDisplay.workAreaSize;

        this.splashWindow = new BrowserWindow({
            width: Math.min(400, width),
            height: Math.min(520, height),
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
            backgroundColor: '#0f0f1a',
            webPreferences: {
                contextIsolation: true,
                sandbox: true,
                // v4.0.10: preload dédié splash — expose UNIQUEMENT first-install
                // (bouton « ceinture et bretelles » si l'app ne démarre pas)
                preload: path.resolve(__dirnameNew, 'splash-preload.js'),
            },
        });

        this.splashWindow.setMenu(null);
        // Pass translations via query params
        const splashParams = new URLSearchParams({
            loading: t('splash.loading'),
            appName: t('app.name'),
            firstInstall: t('login.firstInstall'),
        });
        this.splashWindow.loadFile(splashPath, {search: splashParams.toString()});

        // Safety timeout: close splash after 15s even if the mail interface
        // URL is never detected (slow connection, login wall, error page).
        // 10s was too short for Outlook on mobile — the splash would vanish
        // before the page finished loading, revealing a half-rendered page.
        this.splashTimeout = setTimeout(() => {
            logger.warn('Splash timeout (15s) — forcing splash close');
            // v4.0.36: tell the user to relaunch if the splash got stuck
            try { this.sendUbportsNotification(t('app.name'), t('splash.timeout')); } catch (e) { /* ignore */ }
            this.closeSplashWindow();
        }, 15000);
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
        // v4.0.10 (fix upgrade from < 3.0): ALWAYS show on the first splash
        // close. A startMinimized=true persisted by a v2.x settings.json used
        // to keep the window hidden here → app running but invisible, user
        // stuck on the splash / transparent screen. (settings.mjs now also
        // forces startMinimized=false at startup; this is defense in depth.)
        if (this.win && !this.win.isDestroyed()) {
            logger.info('closeSplashWindow: showing main window');
            this.initialMinimization.domReady = false;
            this.handleDisplayChange(); // v3.3.82: fenêtre plein écran dès le départ en portrait
            this.win.show();
            // v3.3.31: grab the X11 focus too — a visible-but-unfocused window
            // does not raise Maliit's virtual keyboard when the login field is
            // tapped (password field stays empty).
            this.win.focus();
        } else {
            logger.warn(`closeSplashWindow: NOT showing main window (win=${!!this.win}, destroyed=${this.win?.isDestroyed()})`);
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

    // v4.0.37: masquait la fenêtre pendant le resync d'une boucle 2FA.
    // v4.0.39: ne plus masquer — sur Ubuntu Touch (FP5, GPU Adreno/Zink fragile)
    // le win.hide() provoquait la mort du process GPU (FATAL "GPU process isn't
    // usable") donc l'app « sortait » aussitôt après la validation du compte.
    // v4.0.40: au lieu de masquer, affiche un VOILE BLANC opaque avec un message
    // i18n « Veuillez patienter... » en gros — bloque les taps (évite le double
    // appui sur le bouton pendant le resync) sans toucher au GPU.
    // Retiré quand une page mail charge (voir isMailPage) ou après 20 s (fallback).
    hideDuringResync() {
        if (this.resyncHidden) return;
        this.resyncHidden = true;
        logger.info('resync 2FA en cours — voile blanc « veuillez patienter » (v4.0.40)');
        try {
            const msg = JSON.stringify(t('resync.pleaseWait'));
            this.win.webContents.executeJavaScript(`
                (function () {
                    if (document.getElementById('utoutlook-resync-overlay')) return;
                    var d = document.createElement('div');
                    d.id = 'utoutlook-resync-overlay';
                    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#ffffff;' +
                        'display:flex;align-items:center;justify-content:center;text-align:center;' +
                        'font-family:sans-serif;font-size:8vw;font-weight:bold;color:#E95420;' +
                        'padding:2em;cursor:wait;user-select:none;';
                    d.textContent = ${msg};
                    document.body.appendChild(d);
                })();
            `).catch(() => {});
        } catch (e) { /* ignore */ }
        setTimeout(() => {
            if (this.resyncHidden && this.alive) {
                this.resyncHidden = false;
                this.removeResyncOverlay();
            }
        }, 20000);
    }

    removeResyncOverlay() {
        try {
            this.win.webContents.executeJavaScript(`
                (function () {
                    var d = document.getElementById('utoutlook-resync-overlay');
                    if (d) d.remove();
                })();
            `).catch(() => {});
        } catch (e) { /* ignore */ }
    }

    // v4.0.37: 2FA loop via in-page (SPA) navigations. On desktop the loop
    // after Authenticator approval is a series of pushState on
    // login.live.com/ppsecure/post.srf — did-finish-load never fires, so the
    // full-load detector misses it. Count these too and break the loop the
    // same way (aggressive cookie sync + reload last mail URL).
    trackInPageAuthLoop(url) {
        // v4.0.38: ppsecure/post.srf est AUSSI la page normale juste APRÈS une
        // validation de compte réussie (le SPA rejoue le POST de login par
        // pushState). v4.0.39: on compte à nouveau post.srf seul (comme v4.0.37)
        // car sur le téléphone la VRAIE boucle 2FA est une répétition pure de
        // post.srf sans jamais atteindre la page mail — exiger un rebond vers
        // /authorize désactivait la détection et la boucle revenait. Le faux
        // positif d'avant venait du win.hide() (crash GPU sur UT), pas du
        // comptage : hideDuringResync ne masque plus la fenêtre (v4.0.39).
        // Reset propre si la page mail est atteinte en in-page (login réussi).
        let isLoopPage = false;
        try {
            isLoopPage = new URL(url).pathname.includes('ppsecure/post.srf');
        } catch (e) { return; }
        const isMailPage = url.includes('outlook.live.com/mail') ||
                           url.includes('outlook.office.com/mail') ||
                           url.includes('outlook.office365.com/mail') ||
                           url.includes('outlook.cloud.microsoft/mail') ||
                           url.includes('outlook.com/mail');
        if (isMailPage) {
            this.inPageAuthEvents = [];
            return;
        }
        if (!isLoopPage) return;
        const now = Date.now();
        this.inPageAuthEvents.push({t: now, kind: 'post'});
        this.inPageAuthEvents = this.inPageAuthEvents.filter(e => now - e.t < 30000);
        const postCount = this.inPageAuthEvents.length;
        // v4.0.41: ne JAMAIS déclencher la reprise 2FA si la page mail a été
        // atteinte il y a moins de 60 s — le token vient d'être posé et flushé,
        // recharger maintenant le perdrait (retour au login).
        const mailRecentlyReached = this.lastMailPageTime && (now - this.lastMailPageTime < 60000);
        if (postCount >= 4 && this.lastMailUrl && !this.mfaLoopDetected && !mailRecentlyReached) {
            this.mfaLoopDetected = true;
            logger.warn(`2FA SPA loop detected: ${postCount} post.srf in-page navigations in 30s with bounce-back to auth page — aggressive cookie sync`);
            this.hideDuringResync();
            this.loginPageLoadTimes = [];
            this.authStartLoadTimes = [];
            this.inPageAuthEvents = [];
            this.syncCookiesToLiveCom().then(async () => {
                try { await session.fromPartition(this.sessionPartition).cookies.flushStore(); } catch (e) { /* ignore */ }
                // v4.0.37: compte perso (outlook.fr/hotmail) — la session vit sur live.com,
                        // office.com/cloud.microsoft rebondissent sur oauthRedirect.html.
                        const lastUrl = this.lastMailUrl || this.mainMailServiceUrl || '';
                        // v4.0.37: live.com uniquement pour un compte PERSO (knownEmail n'est renseigné
                        // que pour outlook/hotmail/live/msn) ; compte pro = on garde lastUrl.
                        const isPersonal = !!this.knownEmail;
                        const target = (isPersonal && (lastUrl.includes('office.com') || lastUrl.includes('cloud.microsoft')))
                            ? 'https://outlook.live.com/mail/' : lastUrl;
                logger.info(`2FA SPA loop: reloading ${target} after aggressive cookie sync`);
                this.win.loadURL(target);
                this.mfaLoopDetected = false;
            }).catch(() => {});
        } else if (postCount >= 4 && !this.lastMailUrl && !this.mfaLoopDetected && !mailRecentlyReached) {
            // v4.0.41: boucle post.srf SANS jamais avoir atteint la page mail
            // (token perdu / connexion vierge) — recharger avec prompt=login
            // pour forcer le formulaire de login au lieu du resume SSO/select_account
            // qui boucle en boucle sur post.srf sans laisser l'utilisateur interagir.
            this.mfaLoopDetected = true;
            logger.warn(`2FA SPA loop (no mail page yet): ${postCount} post.srf in 30s — reloading with prompt=login to show login form`);
            this.inPageAuthEvents = [];
            this.loginPageLoadTimes = [];
            this.authStartLoadTimes = [];
            this.syncCookiesToLiveCom().then(async () => {
                try { await session.fromPartition(this.sessionPartition).cookies.flushStore(); } catch (e) { /* ignore */ }
                let target = this.mainMailServiceUrl || 'https://outlook.office.com/mail/';
                target += (target.includes('?') ? '&' : '?') + 'prompt=login';
                logger.info(`2FA SPA loop (no mail): reloading ${target} with prompt=login`);
                this.win.loadURL(target);
                this.mfaLoopDetected = false;
            }).catch(() => {});
        }
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

        // v3.3.32: never throttle rendering when the window is hidden/backgrounded —
        // on Ubuntu Touch a throttled X11 window is not repainted after wake →
        // white screen. Combined with the resume handler below.
        this.win.webContents.setBackgroundThrottling(false);

        this.isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
        if (this.isDev) {
            this.win.webContents.openDevTools();
        }

        fs.writeFile(INIT_FLAG_FILE, 'initialise!', err => { if (err) logger.error(err); });
    }

    /**
     * v3.3.18: read the known Microsoft account email from the partition's
     * Local Storage (leveldb) — used ONLY locally to add login_hint= to the
     * authorize URL so the select_account page shows the account tile.
     * NEVER log or publish this email (confidentiality rule).
     * @returns {string|null}
     */
    readKnownAccountEmail() {
        // v3.3.82: avec une partition persist:xxx, Chromium stocke le Local
        // Storage dans userData/Partitions/<partition>/Local Storage — lire
        // AUSSI ce répertoire (c'est celui réellement utilisé), sinon le
        // dernier login validé n'apparaît plus dans la fenêtre de login.
        const candidates = [
            path.join(app.getPath('userData'), 'Local Storage', 'leveldb'),
            path.join(app.getPath('userData'), 'Partitions', this.sessionPartition.replace(/^persist:/, ''), 'Local Storage', 'leveldb'),
        ];
        for (const leveldbDir of candidates) {
            try {
                const files = fs.readdirSync(leveldbDir).filter(f => f.endsWith('.log') || f.endsWith('.ldb'));
                for (const f of files) {
                    const buf = fs.readFileSync(path.join(leveldbDir, f));
                    // v4.0.2: Chromium leveldb stocke souvent en UTF-16LE — tester
                    // les deux décodages, sinon l'email n'est jamais trouvé et le
                    // login_hint (tuile du compte sur la page de login) disparaît.
                    for (const enc of ['latin1', 'utf16le']) {
                        const m = buf.toString(enc).match(/[a-zA-Z0-9._%+-]+@(outlook|hotmail|live|msn|passport)\.[a-z.]{2,}/i);
                        if (m) return m[0];
                    }
                }
            } catch (e) { /* répertoire absent — essayer le suivant */ }
        }
        return null;
    }

    // v3.3.22: this.win is set to null on 'closed', but webContents event handlers
    // can still fire afterwards → TypeError (setProgressBar/webContents of null)
    // → uncaughtException → app.exit(1) (crash.log: 10× setProgressBar, 6× webContents).
    get alive() {
        return !!(this.win && !this.win.isDestroyed());
    }

    async loadMainUrl() {
        // v3.3.18: known account email (local only, never logged/published) — used
        // to add login_hint= to the authorize URL so the account tile shows.
        this.knownEmail = this.readKnownAccountEmail();

        // Dynamic user agent based on the Chromium version bundled with Electron
        const chromeVersion = process.versions.chrome || '143.0.0.0';
        const userAgentOS = "X11; Linux x86_64";
        const customUserAgent =
            `Mozilla/5.0 ${userAgentOS} AppleWebKit/537.36 (KHTML, like Gecko) ` +
            `Chrome/${chromeVersion} Safari/537.36 Edg/${chromeVersion}`;

        // v3.3.17: sync cookies BEFORE the first navigation (not in parallel) so
        // the select_account page on login.microsoftonline.com already receives
        // the shared auth cookies (login.live.com → login.microsoftonline.com) and
        // reliably shows the account tile. No auto-login: the user clicks the tile.
        // v4.0.45: restaurer d'abord le token sauvegardé (si Chromium l'a perdu)
        if (this.restoreAuthToken) await this.restoreAuthToken();
        await this.syncCookiesToLiveCom().catch(e => logger.warn('Initial cookie sync failed:', e.message));

        // v4.0.48: si on a un token sauvegardé ET un compte perso connu, démarrer
        // DIRECTEMENT sur outlook.live.com/mail/ — office.com force prompt=select_account
        // même avec une session valide, ce qui renvoie systématiquement sur la page de login.
        let startUrl = this.mainMailServiceUrl;
        if (this.knownEmail && /@(outlook|hotmail|live|msn|passport)\./i.test(this.knownEmail)) {
            const hasToken = fs.existsSync(path.join(DATA_DIR, 'auth-token.json'));
            if (hasToken) {
                startUrl = 'https://outlook.live.com/mail/';
                logger.info('v4.0.48: token sauvegardé + compte perso — démarrage direct sur outlook.live.com/mail/');
            }
        }
        this.win.loadURL(startUrl, {userAgent: customUserAgent});

        this.win.webContents.on('did-finish-load', () => {
            if (!this.alive) return; // v3.3.22: window closed mid-load
            this.loginPage++;
            // v4.0.79: après un (re)chargement, fermer le volet de navigation s'il
            // recouvre la liste (arrive après le reload post-rotation)
            // v4.0.95: réinjecte aussi le bouton « Recharger les messages » après
            // le chargement complet (dom-ready peut passer avant que le body SPA
            // ne soit remplacé / que la page mail ne soit réellement affichée).
            setTimeout(() => { this.fixMailLayout(); this.injectReloadButton(); }, 2000);
            const url = this.win.webContents.getURL();
            logger.info(`Page loaded #${this.loginPage}: ${url}`);

            // v3.3.14: re-sync on every load — cheap and keeps cloud.microsoft /
            // live.com in sync as Microsoft rotates domains during the redirect chain.
            this.syncCookiesToLiveCom().catch(() => {});

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
            // v4.0.85: la liste des messages est atteinte — autorise la relance
            // après rotation (le poller bloque le quit tant que ce flag est false).
            if (this.isMailInterfaceUrl(url)) {
                this.mailListReady = true;
                // v4.0.88: réveille le clavier virtuel (Maliit) — après une relance
                // rapide (rotation), la fenêtre peut perdre le focus et le clavier
                // on-screen n'envoie plus aucune touche.
                [500, 1500, 3000, 6000].forEach(ms => setTimeout(() => this.wakeVirtualKeyboard(), ms));
            }



            // --- Cookie sync for personal accounts (hotfix #7c) ---
            // When outlook.office.com/mail/ loads with an auth code (#code=...),
            // the page will redirect to outlook.live.com/mail/?login_hint=... for
            // personal accounts. Sync cookies NOW (before the redirect) so the
            // session is valid on .live.com and the redirect loop is avoided.
            // v3.3.59: also cover outlook.live.com and outlook.cloud.microsoft with
            // ?code= or #code= (post-2FA redirect carries an auth code too).
            const hasAuthCode = url.includes('#code=') || url.includes('?code=');
            const isOutlookMail = url.includes('outlook.office.com/mail') ||
                                  url.includes('outlook.live.com/mail') ||
                                  url.includes('outlook.office365.com/mail') ||
                                  url.includes('outlook.cloud.microsoft/mail');
            if (isOutlookMail && hasAuthCode) {
                logger.info('Auth code detected — syncing cookies before redirect (v3.3.59)');
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

            // v3.3.11: outlook.cloud.microsoft/mail is a mail page too.
            const isMailPage = url.includes('outlook.com/mail') ||
                               url.includes('outlook.live.com/mail') ||
                               url.includes('outlook.office.com/mail') ||
                               url.includes('outlook.office365.com/mail') ||
                               url.includes('outlook.cloud.microsoft/mail');
            const mailLoads = this.pageLoadTimes.filter(p =>
                p.url.includes('outlook.com/mail') ||
                p.url.includes('outlook.live.com/mail') ||
                p.url.includes('outlook.office.com/mail') ||
                p.url.includes('outlook.office365.com/mail') ||
                p.url.includes('outlook.cloud.microsoft/mail')
            );
            if (isMailPage) {
                // v4.0.40: retire le voile « veuillez patienter » pendant un resync de boucle 2FA
                if (this.resyncHidden) {
                    this.resyncHidden = false;
                    this.removeResyncOverlay();
                }
                // v3.3.67: mémorise la dernière URL mail propre (sans ?code=#) —
                // cible de reprise après une boucle 2FA (live.com pour les comptes perso)
                this.lastMailUrl = url.split('?')[0].split('#')[0];
                // v4.0.41: flush IMMÉDIAT des cookies quand la page mail est atteinte —
                // le token MSAAUTH/__Host-MSAAUTHP posé pendant le login doit être
                // écrit sur disque tout de suite, pas dans 15 s (perdu si kill/reload).
                this.lastMailPageTime = now;
                this.flushSessionCookies();
                session.fromPartition(this.sessionPartition).cookies.flushStore().catch(() => {});
                // v4.0.56: page mail atteinte — purger le jar des cookies non-essentiels
                // accumulés pendant le login (sinon le prochain login repart avec un
                // header Cookie trop gros → 431 après la 2FA)
                this.cleanNonCoreCookies().catch(() => {});
            }

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
                }).catch(() => {}); // v3.3.66: avoid unhandled rejection
            }

            // --- v3.3.59: 2FA/MFA loop detection ---
            // After approving the Microsoft Authenticator push on another device,
            // Microsoft sets session cookies on login.microsoftonline.com then
            // redirects to outlook.live.com/mail. If those cookies are not
            // propagated to live.com / cloud.microsoft, the mail page bounces
            // back to the 2FA prompt → infinite loop. Detect frequent loads of
            // login.microsoftonline.com (the 2FA/verify page) and force an
            // aggressive cookie sync + flush.
            const isMfaPage = url.includes('login.microsoftonline.com') ||
                              url.includes('login.live.com') ||
                              url.includes('account.live.com') ||
                              url.includes('oauth') ||
                              url.includes('consent');
            // v3.3.67: ne compte que les pages de DÉMARRAGE d'auth (authorize /
            // select_account). Un flux 2FA légitime (authorize → verify → KMSI)
            // ne les visite qu'1-2 fois ; une boucle « rester connecté » les
            // recharge à chaque cycle → seuil 4 en 30s ne se déclenche plus en
            // plein flux 2FA légitime (qui provoquait une NOUVELLE requête d'auth).
            let isAuthStartPage = false;
            try {
                const path = new URL(url).pathname;
                // v4.0.37: en desktop la boucle 2FA passe par ppsecure/post.srf
                // (rejeu du POST Microsoft) — sans ça le détecteur ne compte
                // jamais ces rechargements et la boucle est infinie.
                isAuthStartPage = path.includes('/authorize') || path.includes('select_account') || path.includes('ppsecure/post.srf');
            } catch (e) { /* URL invalide — ignore */ }
            if (isMfaPage) {
                this.loginPageLoadTimes.push({url, time: now});
                this.loginPageLoadTimes = this.loginPageLoadTimes.filter(p => now - p.time < 30000);
                if (isAuthStartPage) {
                    this.authStartLoadTimes.push(now);
                    this.authStartLoadTimes = this.authStartLoadTimes.filter(t => now - t < 30000);
                }
                const recentMfaLoads = this.authStartLoadTimes.length;
                // Flush cookies immediately on every login page load — the 2FA
                // approval cookie must survive even if the app is killed before
                // the next periodic flush (15s).
                session.fromPartition(this.sessionPartition).cookies.flushStore()
                    .catch(() => {});
                // v3.3.70: ne JAMAIS déclencher la reprise si aucune page mail n'a
                // encore été chargée (connexion vierge) — recharger mainMailServiceUrl
                // ne ferait que reboucler office.com → /authorize → « tentative de
                // connexion en cours » en boucle, sans aucune saisie utilisateur.
                // v4.0.41: ne pas déclencher non plus si la page mail a été atteinte
                // il y a moins de 60 s — le token vient d'être flushé, recharger le perd.
                const mailRecentlyReached = this.lastMailPageTime && (now - this.lastMailPageTime < 60000);
                if (recentMfaLoads >= 5 && this.lastMailUrl && !this.mfaLoopDetected && !mailRecentlyReached) {
                    this.mfaLoopDetected = true;
                    logger.warn(`2FA loop detected: ${recentMfaLoads} auth-start page loads in 30s — aggressive cookie sync`);
                    this.hideDuringResync();
                    this.loginPageLoadTimes = [];
                    this.authStartLoadTimes = [];
                    this.syncCookiesToLiveCom().then(async () => {
                        // Extra flush after sync to persist the copied cookies
                        try {
                            await session.fromPartition(this.sessionPartition).cookies.flushStore();
                        } catch (e) { /* ignore */ }
                        // v3.3.67: recharge la dernière URL mail réellement chargée
                        // (outlook.live.com pour les comptes perso), PAS office.com
                        // en dur — office.com n'a pas la session perso et rebondit
                        // sur /authorize → nouvelle requête d'auth Authenticator.
                        // v4.0.37: compte perso (outlook.fr/hotmail) — la session vit sur live.com,
                        // office.com/cloud.microsoft rebondissent sur oauthRedirect.html.
                        const lastUrl = this.lastMailUrl || this.mainMailServiceUrl || '';
                        // v4.0.37: live.com uniquement pour un compte PERSO (knownEmail n'est renseigné
                        // que pour outlook/hotmail/live/msn) ; compte pro = on garde lastUrl.
                        const isPersonal = !!this.knownEmail;
                        const target = (isPersonal && (lastUrl.includes('office.com') || lastUrl.includes('cloud.microsoft')))
                            ? 'https://outlook.live.com/mail/' : lastUrl;
                        logger.info(`2FA loop: reloading ${target} after aggressive cookie sync`);
                        this.win.loadURL(target);
                        this.mfaLoopDetected = false;
                    }).catch(() => {}); // v3.3.66
                } else if (recentMfaLoads >= 5 && !this.lastMailUrl && !this.mfaLoopDetected && !mailRecentlyReached) {
                    // v4.0.41: boucle authorize/select_account SANS jamais avoir atteint
                    // la page mail (token perdu) — recharger avec prompt=login pour
                    // forcer le formulaire de login au lieu du resume SSO qui boucle.
                    this.mfaLoopDetected = true;
                    logger.warn(`2FA loop (no mail page yet): ${recentMfaLoads} auth-start loads in 30s — reloading with prompt=login`);
                    this.loginPageLoadTimes = [];
                    this.authStartLoadTimes = [];
                    this.syncCookiesToLiveCom().then(async () => {
                        try { await session.fromPartition(this.sessionPartition).cookies.flushStore(); } catch (e) { /* ignore */ }
                        let target = this.mainMailServiceUrl || 'https://outlook.office.com/mail/';
                        target += (target.includes('?') ? '&' : '?') + 'prompt=login';
                        logger.info(`2FA loop (no mail): reloading ${target} with prompt=login`);
                        this.win.loadURL(target);
                        this.mfaLoopDetected = false;
                    }).catch(() => {});
                }
            } else {
                // Reset the MFA loop detector when we leave the login pages
                this.loginPageLoadTimes = [];
                this.authStartLoadTimes = [];
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
            if (!this.alive) return; // v3.3.22
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
        this._on(ipcMain, "show", (event) => {
            // Only respond if this is our window's webContents
            if (this.win && event.sender === this.win.webContents) {
                this.show();
            }
        });

        this._on(ipcMain, "insert-text", (event, text) => {
            if (this.win && event.sender === this.win.webContents) {
                this.insertText(text);
            }
        });

        this._on(ipcMain, "zoom", (event, {action}) => {
            if (this.win && event.sender === this.win.webContents) {
                this.handleZoomCommand(action);
            }
        });

        // Per-account unread tracking (filter by sender)
        this._on(ipcMain, "updateUnread", (event, value) => {
            if (this.win && event.sender === this.win.webContents) {
                this.unreadCount = value || 0;
                if (this.onUnreadChange) {
                    this.onUnreadChange(this.accountId, this.unreadCount);
                }
                // v3.3.21: notify the unread count EVEN when the mailbox is open
                // (user request) — but only when the count actually changed and
                // is > 0, to avoid spamming on SPA re-render fluctuations.
                if (this.unreadCount > 0 && this.unreadCount !== this.lastNotifiedUnread) {
                    this.lastNotifiedUnread = this.unreadCount;
                    this.handleNotification(
                        t('notif.newMessages.title'),
                        t('notif.newMessages.body', {count: this.unreadCount})
                    );
                }
                if (this.unreadCount === 0) this.lastNotifiedUnread = 0;
            }
        });

        this._on(ipcMain, "show-notification", (event, {title, body, icon, urgent}) => {
            if (this.win && event.sender === this.win.webContents) {
                // hotfix #13: skip notification when the app is in the foreground —
                // UNLESS urgent (e.g. DOM changed alert, v3.3.21).
                if (!urgent && this.win.isVisible() && this.win.isFocused()) {
                    logger.info(`[NOTIFICATION SUPPRESSED] foreground — title="${title}" body="${body}"`);
                    return;
                }
                this.handleNotification(title, body, icon);
            }
        });

        // Focus mode toggle (from renderer or tray)
        this._on(ipcMain, "toggle-focus-mode", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.toggleFocusMode();
            }
        });

        // Accent color change (from renderer or tray)
        this._on(ipcMain, "set-accent-color", (event, color) => {
            if (this.win && event.sender === this.win.webContents) {
                this.setAccentColor(color);
            }
        });

        // Dark mode toggle (from renderer or tray)
        this._on(ipcMain, "toggle-dark-mode", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.toggleDarkMode();
            }
        });

        // Reload (from renderer, e.g. offline.html retry button)
        this._on(ipcMain, "reload", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.reloadWindow();
            }
        });
        // v4.0.95: bouton « Recharger les messages » en bas de la liste
        this._on(ipcMain, "reload-messages", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                this.manualReloadMessages();
            }
        });
        // v4.0.95: bouton « Quitter » — VRAI quit propre (app.quit() déclenche
        // before-quit → cleanupAndExit → exitclient + flushed cookies) pour que
        // le wrapper command.sh voie le flag et s'arrête aussi, sans swipe.
        this._on(ipcMain, "quit-app", (event) => {
            if (this.win && event.sender === this.win.webContents) {
                logger.info('v4.0.95: fermeture demandée par le bouton Quitter');
                app.quit();
            }
        });
        // v4.0.127: override manuel du rendu logiciel. Le wrapper lit ce même
        // fichier au prochain lancement (auto + bascule sur crash GPU).
        // v4.1.0 (revue B9): un handle par compte lève "second handler" dès le
        // 2ᵉ compte → uncaughtException → app.exit(1). On retire avant d'ajouter.
        ipcMain.removeHandler("get-render-mode");
        ipcMain.handle("get-render-mode", () => {
            try { return fs.readFileSync(RENDER_MODE_FILE, 'utf-8').trim() || 'auto'; }
            catch (e) { return 'auto'; }
        });
        ipcMain.removeHandler("set-render-mode");
        ipcMain.handle("set-render-mode", (event, mode) => {
            // v4.1.0 (revue C13): une page web hostile ne doit pas pouvoir
            // écrire de façon persistante le mode de rendu.
            if (!this.win || this.win.isDestroyed() || event.sender !== this.win.webContents) return false;
            if (!['auto', 'software', 'hardware'].includes(mode)) return false;
            try {
                fs.writeFileSync(RENDER_MODE_FILE, mode);
                logger.info(`v4.0.127: render-mode = ${mode} (effectif au prochain lancement)`);
                return true;
            } catch (e) {
                logger.warn(`v4.0.127: impossible d'écrire render-mode: ${e.message}`);
                return false;
            }
        });
        // v3.3.66: first-install — wipe ALL session data from the main process.
        // The in-page clear (document.cookie/localStorage) only reaches the current
        // origin, and syncCookiesToLiveCom() would re-copy surviving cookies to the
        // other Microsoft domains on the next login page load. Here we remove every
        // cookie from the partition and clear all storage (localStorage, IndexedDB,
        // cache) — knownEmail lives in localStorage leveldb so it goes too.
        // Confirmation uses a NATIVE dialog: window.confirm() is not implemented in
        // Electron and always returns false, which made the in-page confirm inert.
        ipcMain.removeHandler("first-install");
        ipcMain.handle("first-install", async (event) => {
            // v4.0.10: accepte aussi la splash window comme sender (bouton
            // first-install sur le splash, ceinture et bretelles)
            const fromMain = this.win && !this.win.isDestroyed() && event.sender === this.win.webContents;
            const fromSplash = this.splashWindow && !this.splashWindow.isDestroyed() && event.sender === this.splashWindow.webContents;
            if (!fromMain && !fromSplash) return false;
            const parentWin = fromSplash ? this.splashWindow : this.win;
            const {response} = await dialog.showMessageBox(parentWin, {
                type: 'warning',
                title: t('app.name'),
                message: t('login.firstInstallConfirm'),
                buttons: [t('common.cancel'), t('login.firstInstallConfirmAction')],
                defaultId: 0,
                cancelId: 0,
                noLink: true,
            });
            if (response !== 1) return false;
            try {
                this.knownEmail = null;
                const ses = session.fromPartition(this.sessionPartition);
                const cookies = await ses.cookies.get({});
                for (const c of cookies) {
                    const url = `${c.secure ? 'https' : 'http'}://${c.domain.replace(/^\./, '')}${c.path || '/'}`;
                    await ses.cookies.remove(url, c.name).catch(() => {});
                }
                await ses.cookies.flushStore().catch(() => {});
                await ses.clearStorageData().catch(() => {});
                logger.info('First-install: all cookies and storage cleared');
            } catch (e) {
                logger.warn('First-install clear failed:', e.message);
            }
            // v4.0.10: si appelé depuis le splash, fermer le splash (qui affichera
            // la fenêtre principale via closeSplashWindow) puis recharger
            if (fromSplash) this.closeSplashWindow();
            if (this.win && !this.win.isDestroyed()) {
                this.win.loadURL('https://outlook.office.com/mail/');
            }
            return true;
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

    /**
     * v4.0.61: rotation d'écran — après un pivot, la liste des messages Outlook
     * peut devenir vide et ne jamais se réafficher (le SPA ne recalcule pas sa
     * mise en page, et notre CSS injecté a des hauteurs mesurées à l-load).
     * On réinjecte les styles et on force un repaint de la liste (nudge de
     * scrollTop) + on dispatch un vrai événement resize pour le SPA.
     */
    setupOrientationHandler() {
        if (!this.win || this.win.isDestroyed()) return;
        this.lastRotationReload = 0; // v4.0.75: garde-fou anti-boucle du reload de secours
        // v4.0.63: après un pivot, la liste virtualisée d'Outlook garde une
        // hauteur périmée et ses lignes ne sont plus rendues (liste cachée).
        // Il faut un VRAI reflow : on force la re-mesure du conteneur
        // (visibility toggle sur body), on remet scrollTop à 0, on dispatch
        // resize sur window ET document, et on réinjecte les styles — deux
        // fois (à 500 ms et 1500 ms) pour couvrir la fin de l'animation.
        const repaint = (tag) => this.forceListRepaint(tag);
        let timer = null;
        const onResize = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { repaint('resize'); }, 500);
        };
        this.win.webContents.on('resize', onResize);
        this.win.webContents.on('dom-ready', () => {
            this.win.webContents.executeJavaScript(`
                if (!window.__utoutlookOrient) {
                    window.__utoutlookOrient = true;
                    let t = null;
                    const fire = () => {
                        clearTimeout(t);
                        t = setTimeout(() => {
                            window.dispatchEvent(new Event('resize'));
                            setTimeout(() => window.dispatchEvent(new Event('resize')), 1000);
                        }, 500);
                    };
                    window.addEventListener('orientationchange', fire);
                    window.addEventListener('resize', fire);
                }
            `).catch(() => {});
        });
    }

    setupWebContentsEvents() {
        // Log console messages from the renderer — captures JS errors, CSP violations
        this.win.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
            const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'log';
            // v3.3.74: compte les RangeError de la page (page de login Microsoft qui
            // boucle sur « tentative de connexion » quand son Knockout plante)
            if (message.includes('Maximum call stack size exceeded')) {
                const now = Date.now();
                this.pageRangeErrors.push(now);
                this.pageRangeErrors = this.pageRangeErrors.filter(t => now - t < 30000);
                if (this.pageRangeErrors.length >= 5 && !this.sessionClearedForLoop) {
                    this.sessionClearedForLoop = true;
                    const url = this.win.webContents.getURL();
                    logger.warn(`v3.3.74: ${this.pageRangeErrors.length} RangeError/30s sur ${url} — session probablement vérolée, clear + reload avec prompt=login`);
                    this.clearOutlookSession().then(() => {
                        this.pageRangeErrors = [];
                        // force prompt=login pour sauter le resume SSO silencieux
                        // (c'est la vue « Trying to sign you in » qui plante en boucle)
                        let target = this.mainMailServiceUrl;
                        if (url.includes('/authorize')) {
                            target = url.replace(/([?&])prompt=[^&]*/, '$1prompt=login');
                            if (!target.includes('prompt=')) target += (target.includes('?') ? '&' : '?') + 'prompt=login';
                        }
                        this.win.loadURL(target);
                    }).catch(() => {});
                }
            }
            // Skip noisy messages
            if (message.includes('Autofill') || message.includes('DevTools')) return;
            logger.info(`[console.${levelName}] ${message.substring(0, 500)}`);
        });

        // Log failed resource loads — helps diagnose boot failures (olkerror.html)
        this.win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            // -3 (ERR_ABORTED) is normal for SPA redirects — skip it
            if (errorCode === -3) return;
            logger.warn(`Load failed [${errorCode}] ${errorDescription}: ${validatedURL} (mainFrame=${isMainFrame})`);
            // v4.0.10: a main-frame failure (network down, server unreachable,
            // renderer error page) will never match isMailInterfaceUrl/isLoginPageUrl
            // in did-finish-load — close the splash here so the user sees the
            // offline overlay instead of a spinner stuck forever.
            if (isMainFrame) this.closeSplashWindow();
        });

        // v4.0.10: if the renderer process dies (OOM on the phone, GPU crash),
        // did-finish-load never fires — close the splash so the user is not
        // left staring at the spinner.
        this.win.webContents.on('render-process-gone', (_event, details) => {
            logger.error(`Renderer process gone: ${JSON.stringify(details)} — closing splash`);
            this.closeSplashWindow();
        });

        // Insert styles and observer on DOM ready.
        // NOTE (hotfix #15): the splash is NOT closed here anymore. dom-ready
        // fires on every redirect during Outlook's startup chain. Closing the
        // splash here would reveal a half-loaded page (envelope icon + blue
        // progress bar). The splash is now closed by did-finish-load when the
        // URL is the actual mail interface or a login page.
        this.win.webContents.on("dom-ready", () => {
            if (!this.alive) return; // v3.3.22
            this.injectStyles().catch(() => {});
            this.addUnreadNumberObserver().catch(() => {});
            this.injectGestures();
            this.injectReloadButton(); // v4.0.95: bouton « Recharger les messages »
            // v3.3.21: no theme variants — make sure no stale dark-mode class remains
            this.win.webContents.executeJavaScript(
                `document.documentElement.classList.remove('dark-mode');`
            ).catch(() => {});
        });

        // Re-inject on SPA navigation (Outlook is a single-page app)
        this.win.webContents.on('did-navigate-in-page', (_event, url) => {
            if (!this.alive) return; // v3.3.22
            logger.info(`SPA navigation: ${url}`);
            this.trackInPageAuthLoop(url); // v4.0.37: la boucle 2FA desktop passe par des pushState sur ppsecure/post.srf
            this.injectStyles().catch(() => {});
            this.addUnreadNumberObserver().catch(() => {});
            this.injectGestures();
            this.injectReloadButton(); // v4.0.95: bouton « Recharger les messages »
        });

        // Intercept login_hint redirect and sync cookies (hotfix #7c):
        // After login on outlook.office.com, Microsoft redirects personal accounts
        // to outlook.live.com/mail/?login_hint=... The session cookies set on
        // .office.com are NOT sent to .live.com, so the page loops with
        // oauthRedirect.html. Fix: copy cookies from office.com → live.com
        // before loading. Keep the login_hint — the page needs it to identify
        // the account, and the synced cookies provide the session.
        this.win.webContents.on('will-navigate', (event, url) => {
            if (!this.alive) { try { event.preventDefault(); } catch (e) {} return; } // v3.3.22
            // v3.3.78: supprime le cookie SSO « stsservicecookie » sur
            // login.microsoftonline.com AVANT /authorize — sa présence déclenche
            // le resume silencieux « Trying to sign you in » dont la vue Knockout
            // plante en boucle (RangeError) dans Chromium embarqué.
            if (url.includes('login.microsoftonline.com') && url.includes('/authorize')) {
                const ses = session.fromPartition(this.sessionPartition);
                ses.cookies.remove('https://login.microsoftonline.com/', 'stsservicecookie')
                    .catch(() => {});
            }
            // v3.3.11: outlook.cloud.microsoft is the new mail host — same
            // login_hint treatment as live.com.
            if ((url.includes('outlook.live.com/mail') || url.includes('outlook.cloud.microsoft/mail'))
                && url.includes('login_hint=')) {
                event.preventDefault();
                this.loginHintIntercepts++;
                logger.info(`Intercepted login_hint redirect #${this.loginHintIntercepts}: ${url}`);
                this.syncCookiesToLiveCom().then(() => {
                    logger.info(`Loading with synced cookies (login_hint preserved)`);
                    this.win.loadURL(url); // keep login_hint
                }).catch(() => {}); // v3.3.66
                return;
            }
            // v3.3.18: add login_hint=<known email> to the authorize URL so the
            // select_account page shows the account tile. login_hint only
            // PRE-FILLS the account — it does NOT sign in (no auto-login);
            // the user still clicks the tile. Never log the email itself.
            // v4.0.2: relire l'email connu à la volée (le leveldb n'est peuplé
            // qu'après la 1ère connexion) pour que la tuile réapparaisse à chaque fois
            if (!this.knownEmail) this.knownEmail = this.readKnownAccountEmail();
            if (url.includes('login.microsoftonline.com') && url.includes('/authorize') &&
                !url.includes('login_hint=') && this.knownEmail) {
                event.preventDefault();
                const sep = url.includes('?') ? '&' : '?';
                const withHint = `${url}${sep}login_hint=${encodeURIComponent(this.knownEmail)}`;
                logger.info('Adding login_hint to authorize URL (account tile shown, no auto-login)');
                this.win.loadURL(withHint);
                return;
            }
            // v3.3.11: ne PAS réécrire select_account en connexion silencieuse —
            // l'utilisateur veut voir la page « compte retrouvé » et cliquer
            // lui-même sur son compte (pas de connexion automatique).
        });

        // Re-inject after page finishes loading (catches late-rendered SPA content)
        // Also clears the progress bar — merged with setupLoadingIndicators
        // to keep a single did-stop-loading listener.
        this.win.webContents.on('did-stop-loading', () => {
            if (!this.alive) return; // v3.3.22: crash.log — setProgressBar of null
            this.win.setProgressBar(-1);
            // Small delay to let the SPA render after load event
            setTimeout(() => {
                if (this.alive) {
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

    setupPowerEvents() {
        // v3.3.32: after a suspend/resume (screen off → on), the X11/XWayland
        // window is no longer repainted → white screen on wake ("veille puis
        // écran blanc"). powerMonitor 'resume' fires from logind → force a
        // full redraw of the webContents and re-assert visibility/focus.
        this._on(powerMonitor, 'resume', () => {
            logger.info('powerMonitor resume — re-surfacing window (v4.1.0)');
            this.resurfaceWindow(true);
        });
        // v4.1.0: sur le device le event 'resume' de logind n'est pas Always
        // reçu au déverrouillage (journal : aucun "powerMonitor resume" après
        // "gkr-pam: unlocked login keyring") — 'unlock-screen' couvre ce cas.
        this._on(powerMonitor, 'unlock-screen', () => {
            logger.info('powerMonitor unlock-screen — re-surfacing window (v4.1.0)');
            this.resurfaceWindow(true);
        });
        this._on(powerMonitor, 'suspend', () => logger.info('powerMonitor suspend (v3.3.32)'));
    }

    setupWindowEvents() {
        // v3.3.4: log window lifecycle events — needed to diagnose "app does not
        // start" episodes where the process and heartbeat are alive but the
        // window never appears (or is hidden and never re-shown on relaunch).
        // v3.3.32: also force a repaint on every show — covers the return to
        // foreground after the app was backgrounded (Lomiri may SIGSTOP it).
        this.win.on("show", () => {
            logger.info('Window event: show');
            try { this.win.webContents.invalidate(); } catch (e) { /* ignore */ }
        });
        this.win.on("hide", () => logger.info('Window event: hide'));
        this.win.on("focus", () => logger.info('Window event: focus'));
        this.win.on("blur", () => logger.info('Window event: blur'));

        // Hide instead of quit on close
        this.win.on("close", (e) => {
            // v4.0.125: pendant un VRAI quit (bouton Quitter / socket quit /
            // swipe), ne PAS intercepter la fermeture — hideOnClose masquerait
            // la fenêtre, annulerait app.quit() et laisserait l'app vivante mais
            // invisible (heartbeat actif, wrapper.log « client is alive »).
            if (this.win.isVisible() && settings.get("hideOnClose") && !global.utoutlookQuitting) {
                logger.info('Window event: close intercepted (hideOnClose) → hide');
                e.preventDefault();
                this.win.hide();
            } else {
                // v3.3.28: on a swipe-close, Mir stops the session and the X11
                // teardown can kill the process before the 'closed' handler
                // runs — write the clean-quit flag NOW, synchronously, while
                // the 'close' event is being handled, so the shell wrapper
                // does not relaunch the app. Skipped during window recreation
                // (preventAutoCloseApp), hideOnClose, and v4.0.84 rotation
                // relaunch (skipCleanExitFlag) — otherwise app.exit(0) after a
                // pivot would write exitclient and the wrapper would NOT relaunch.
                if (!global.preventAutoCloseApp && !global.skipCleanExitFlag && !global.restartRequested) markCleanExit();
                logger.info('Window event: close → letting it close');
            }
        });

        // Hide instead of minimize
        this.win.on("minimize", (e) => {
            if (settings.get("hideOnMinimize")) {
                logger.info('Window event: minimize intercepted (hideOnMinimize) → hide');
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
            // Stop server reachability monitor (v4.0.3)
            if (this.serverMonitor) {
                clearInterval(this.serverMonitor);
                this.serverMonitor = null;
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
            // v4.0.66: stop rotation poller
            if (this.rotationPoll) {
                clearInterval(this.rotationPoll);
                this.rotationPoll = null;
            }
            // v4.0.89: stop keyboard health watchdog
            if (this.keyboardHealthPoll) {
                clearInterval(this.keyboardHealthPoll);
                this.keyboardHealthPoll = null;
            }
            // v4.1.0: stop surface re-surfacing watchdog
            if (this.surfaceHealthPoll) {
                clearInterval(this.surfaceHealthPoll);
                this.surfaceHealthPoll = null;
            }
            // v4.0.78: stop list-empty watchdog
            if (this.listWatchdog) {
                clearInterval(this.listWatchdog);
                this.listWatchdog = null;
            }
            // Flush cookies one last time before window destruction
            this.flushSessionCookies();
            if (!global.preventAutoCloseApp) {
                // v3.3.28: this app.exit(0) is what actually runs on a
                // swipe-close (window 'closed'), before window-all-closed —
                // write the clean-quit flag synchronously so the wrapper
                // does not relaunch the app.
                // v4.0.85: skip the flag on rotation relaunch (skipCleanExitFlag).
                // v4.1.0 (revue A1/A5): ne jamais court-circuiter le quit propre
                // en cours, ni écrire exitclient sur un relaunch réglages.
                if (!global.skipCleanExitFlag && !global.restartRequested) markCleanExit();
                if (!global.utoutlookQuitting && BrowserWindow.getAllWindows().length === 0) {
                    app.exit(0);
                }
            }
            global.preventAutoCloseApp = false;
        });
    }

    /**
     * v4.0.66: reflow forcé de la liste des messages (reflow body, scrollTop=0,
     * resize dispatché) — utilisé après un pivot d'écran.
     */
    forceListRepaint(tag) {
        if (!this.win || this.win.isDestroyed()) return;
        logger.info(`v4.0.66: repaint liste (${tag})`);
        this.injectStyles().catch(() => {});
        // Script INJECTÉ : uniquement du code renderer (document / window).
        // v4.0.97: le bloc « dernier recours » était à l'intérieur de ce template
        // literal et référençait this.win / logger (process principal) → TypeError
        // à chaque repaint, script tronqué, aucune réparation de layout appliquée.
        this.win.webContents.executeJavaScript(`
            (() => {
                const forceReflow = () => {
                    document.body.style.visibility = 'hidden';
                    void document.body.offsetHeight;
                    document.body.style.visibility = '';
                };
                forceReflow();
                window.dispatchEvent(new Event('resize'));
                document.dispatchEvent(new Event('resize'));
                // v4.0.81: débloquer la listbox rendue 0x0 après un resize — remonter
                // depuis la listbox et forcer display:flex sur tout ancêtre masqué
                // (méthode prouvée sur le device : options 0 px -> 112 px).
                const ml = document.querySelector('[data-app-section="MessageList"]');
                const lb = ml && ml.querySelector('[role="listbox"]');
                if (lb) {
                    // v4.0.100: les conteneurs internes ont height:0 / opacity:0 /
                    // overflow:hidden — un height:100% ne résout rien quand le
                    // parent est à 0. On impose une HAUTEUR EN PX calculée depuis
                    // MessageList sur toute la chaîne jusqu'au listbox.
                    const h = Math.max(200, Math.round(ml.getBoundingClientRect().height) - 10);
                    let a = lb;
                    // v4.0.101: ne JAMAIS figer MessageList lui-même en px —
                    // sinon une valeur calculée pendant un état transitoire de
                    // rotation (200 px) reste gravée et la liste ne grandit plus.
                    while (a && a !== ml && a !== document.body) {
                        a.style.setProperty('display', 'flex', 'important');
                        a.style.setProperty('visibility', 'visible', 'important');
                        a.style.setProperty('opacity', '1', 'important');
                        a.style.setProperty('height', h + 'px', 'important');
                        a.style.setProperty('min-height', h + 'px', 'important');
                        a.style.setProperty('max-height', 'none', 'important');
                        a.style.setProperty('overflow', 'visible', 'important');
                        a = a.parentElement;
                    }
                    // v4.0.104: Outlook met pointer-events:none sur les options
                    // → les taps atterrissent sur le conteneur, pas sur le mail.
                    // On réautorise les clics sur les lignes et leurs enfants.
                    const rows = ml.querySelectorAll('[role="option"], [role="listitem"], [class*="listItem"]');
                    for (const row of rows) {
                        row.style.setProperty('pointer-events', 'auto', 'important');
                        for (const child of row.querySelectorAll('*')) {
                            child.style.setProperty('pointer-events', 'auto', 'important');
                        }
                    }
                }
                const list = document.querySelector('[class*="listView"], [class*="messageList"], [role="main"]');
                if (list) { list.scrollTop = 0; list.scrollTop = 1; list.scrollTop = 0; forceReflow(); }
                // v4.0.113: ne PLUS toucher au volet de navigation ici. Les
                // repaints post-rotation (+0/1,5/2/5/8 s) alternaient
                // display:none (paysage) et removeProperty (portrait) :
                // le menu réapparaissait par séquences. Outlook
                // gère son volet lui-même ; on ne corrige que la liste.
                const msgList = document.querySelector('[data-app-section="MessageList"]');
                if (msgList) {
                    msgList.style.display = 'flex';
                    msgList.style.visibility = 'visible';
                    msgList.style.height = '100%';
                }
            })()
        `).catch(() => {});

        // v4.0.75: dernier recours — vérification CÔTÉ PROCESS PRINCIPAL,
        // hors du template literal injecté (this.win, logger, flags).
        setTimeout(() => {
            if (!this.win || this.win.isDestroyed()) return;
            this.win.webContents.executeJavaScript(`
                (() => {
                    const ml = document.querySelector('[data-app-section="MessageList"]');
                    const o = ml && ml.querySelector('[role="option"], [role="listitem"], [class*="listItem"]');
                    return !(o && o.getBoundingClientRect().height > 0);
                })()
            `).then((listHidden) => {
                if (!listHidden) return;
                const now = Date.now();
                // v4.0.95: flag dédié, sans toucher au détecteur de rotation.
                if (this.autoReloadBlockedUntil && now < this.autoReloadBlockedUntil) return;
                if (this.lastRotationReload && now - this.lastRotationReload < 30000) return;
                this.lastRotationReload = now;
                logger.warn('v4.0.75: liste toujours invisible après repaint — reload de la page');
                this.win.webContents.reload();
            }).catch(() => {});
        }, 1200);
    }

    /**
     * v4.0.88: réveille le clavier virtuel Maliit après (re)lancement — focus
     * fenêtre + cycle blur/focus dans le renderer pour réactiver le text-input.
     */
    wakeVirtualKeyboard() {
        if (!this.win || this.win.isDestroyed()) return;
        try { this.win.focus(); } catch (e) { /* ignore */ }
        try { this.win.webContents.focus(); } catch (e) { /* ignore */ }
        this.win.webContents.executeJavaScript(`
            (() => {
                try {
                    const ae = document.activeElement;
                    if (ae && ae.blur) ae.blur();
                    if (document.body && document.body.focus) document.body.focus();
                    document.dispatchEvent(new Event('pointerdown', {bubbles: true}));
                    window.dispatchEvent(new Event('focus'));
                } catch (e) {}
            })()
        `).catch(() => {});
    }

    /**
     * v4.0.76: toast « changement d'orientation » — l'utilisateur voit que
     * l'app a détecté le pivot et agit (repaint/reload). Disparaît après 1,5 s.
     */
    showRotationToast() {
        this.showToast(t('overlay.rotation'));
    }

    /**
     * Toast générique en bas d'écran (fond sombre, texte orange), 1,5 s.
     */
    showToast(msg) {
        if (!this.win || this.win.isDestroyed()) return;
        this.win.webContents.executeJavaScript(`
            (() => {
                let el = document.getElementById('utoutlook-rotation-toast');
                if (!el) {
                    el = document.createElement('div');
                    el.id = 'utoutlook-rotation-toast';
                    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
                        'background:rgba(15,15,26,0.92);color:#E95420;padding:10px 18px;border-radius:20px;' +
                        'font:14px sans-serif;z-index:999999;pointer-events:none;transition:opacity .3s;white-space:nowrap;';
                    document.body.appendChild(el);
                }
                el.textContent = ${JSON.stringify(msg)};
                el.style.opacity = '1';
                clearTimeout(el.__t);
                el.__t = setTimeout(() => { el.style.opacity = '0'; }, 1500);
            })()
        `).catch(() => {});
    }

    /**
     * v4.0.79: fermer le volet de navigation s'il recouvre la liste des messages
     * (typique après un reload en layout étroit / paysage). Sélecteurs vérifiés
     * sur le DOM réel : data-app-section="NavigationPane" + bouton
     * « Masquer le volet de navigation ».
     */
    closeNavIfCovering() { this.fixMailLayout(); }

    /**
     * v4.0.83: réparation de la mise en page mail — (a) débloquer la listbox
     * rendue 0x0 (ancêtres display:none -> flex, prouvé sur device : options
     * 0 px -> 112 px) ; (b) masquer le volet de nav s'il recouvre la liste, par
     * classe CSS (clic utilisateur sur le bouton du volet lève le masque).
     * Appelée après chaque did-finish-load et chaque repaint.
     */
    fixMailLayout() {
        if (!this.win || this.win.isDestroyed()) return;
        this.win.webContents.executeJavaScript(`
            (() => {
                // (a) débloquer la listbox 0x0
                const ml = document.querySelector('[data-app-section="MessageList"]');
                const lb = ml && ml.querySelector('[role="listbox"]');
                if (lb) {
                    // v4.0.100: les conteneurs internes ont height:0 / opacity:0 /
                    // overflow:hidden — un height:100% ne résout rien quand le
                    // parent est à 0. On impose une HAUTEUR EN PX calculée depuis
                    // MessageList sur toute la chaîne jusqu'au listbox.
                    const h = Math.max(200, Math.round(ml.getBoundingClientRect().height) - 10);
                    let a = lb;
                    // v4.0.101: ne JAMAIS figer MessageList lui-même en px —
                    // sinon une valeur calculée pendant un état transitoire de
                    // rotation (200 px) reste gravée et la liste ne grandit plus.
                    while (a && a !== ml && a !== document.body) {
                        a.style.setProperty('display', 'flex', 'important');
                        a.style.setProperty('visibility', 'visible', 'important');
                        a.style.setProperty('opacity', '1', 'important');
                        a.style.setProperty('height', h + 'px', 'important');
                        a.style.setProperty('min-height', h + 'px', 'important');
                        a.style.setProperty('max-height', 'none', 'important');
                        a.style.setProperty('overflow', 'visible', 'important');
                        a = a.parentElement;
                    }
                    // v4.0.104: Outlook met pointer-events:none sur les options
                    // → les taps atterrissent sur le conteneur, pas sur le mail.
                    // On réautorise les clics sur les lignes et leurs enfants.
                    const rows = ml.querySelectorAll('[role="option"], [role="listitem"], [class*="listItem"]');
                    for (const row of rows) {
                        row.style.setProperty('pointer-events', 'auto', 'important');
                        for (const child of row.querySelectorAll('*')) {
                            child.style.setProperty('pointer-events', 'auto', 'important');
                        }
                    }
                }
                // (b) volet de navigation
                // v4.0.81: NE PLUS CLIQUER sur le bouton (c'est un toggle — cliqué
                // au mauvais moment il ROUVRE le volet, boucle infinie). On masque
                // le volet par une classe CSS déterministe.
                if (!document.getElementById('utoutlook-nav-hide-css')) {
                    const st = document.createElement('style');
                    st.id = 'utoutlook-nav-hide-css';
                    // v4.0.120: le masque par défaut est dans main.css ; ici
                    // on ajoute seulement la règle d'affichage sur vrai tap.
                    st.textContent = 'html.utoutlook-show-nav [data-app-section="NavigationPane"]{display:flex !important;}';
                    document.head.appendChild(st);
                }
                // v4.0.113: le masque CSS n'est plus piloté automatiquement
                // (clignotement du menu après rotation). On garde l'écouteur
                // pour lever le masque si un ancien état l'avait posé.
                // v4.0.82: le masque CSS ne doit pas bloquer l'utilisateur — s'il
                // clique sur le bouton du volet de navigation, on lève le masque.
                if (!window.__utoutlookNavYield) {
                    window.__utoutlookNavYield = true;
                    document.addEventListener('click', (ev) => {
                        // v4.0.119: ignorer les clics programmatiques d'Outlook
                        // (restauration d'état au chargement) — seul un vrai tap
                        // utilisateur doit lever notre masque.
                        if (!ev.isTrusted) return;
                        const b = ev.target.closest && ev.target.closest('button[aria-label], [role="button"][aria-label]');
                        const lbl = (b && b.getAttribute('aria-label')) || '';
                        // v4.0.118: pas le simple mot « menu » (barre d'outils)
                        if (/volet de navigation|navigation pane|masquer le volet|afficher le volet|hide navigation|show navigation/i.test(lbl)) {
                            document.documentElement.classList.add('utoutlook-show-nav');
                        }
                    }, true);
                }
            })()
        `).catch(() => {});
    }

    setupScreenEvents() {
        this._on(screen, 'display-metrics-changed', () => { this.handleDisplayChange(); });
        this._on(screen, 'display-added', () => this.handleDisplayChange());
        this._on(screen, 'display-removed', () => this.handleDisplayChange());
        // v4.1.0: filet de sécurité — même sans event powerMonitor (constaté
        // sur device), réintègre périodiquement la surface Mir si la fenêtre
        // est censée être visible. Pas de focus volé : stealFocus = false.
        this.surfaceHealthPoll = setInterval(() => {
            if (this.alive && this.win.isVisible() && !global.utoutlookQuitting) {
                this.resurfaceWindow(false);
            }
        }, 30000);
        // v4.0.66: sur UT, un pivot ne déclenche PAS display-metrics-changed ni
        // webContents resize (vérifié dans les logs : 0 événement) — la rotation
        // est faite au niveau compositor. On POLL la rotation de l'écran et on
        // force setBounds + invalidate + repaint de la liste quand elle change.
        this.lastDisplayKey = '';
        this.lastRotationTime = 0; // v4.0.78: timestamp de la dernière rotation détectée
        this.mailListReady = false; // v4.0.85: true quand la page mail (liste des messages) est atteinte
        // v4.0.89: watchdog clavier — après une relance post-rotation, le focus
        // Wayland peut être perdu sans événement blur/focus : le clavier Maliit
        // n'envoie alors plus rien. Toutes les 3 s, si la page n'a plus le focus
        // document, on restaure le focus fenêtre + renderer.
        this.keyboardHealthPoll = setInterval(() => {
            // v4.0.125: ne pas réveiller le clavier / refocuser une fenêtre
            // pendant le quit (sinon logs blur/focus sur une fenêtre cachée).
            if (global.utoutlookQuitting) return;
            // v4.1.0 (revue D18): ne pas voler le focus d'une fenêtre masquée
            // volontairement (swipe-close).
            if (!this.alive || !this.win.isVisible() || !this.mailListReady) return;
            this.win.webContents.executeJavaScript('document.hasFocus()').then(has => {
                if (!has && this.win && !this.win.isDestroyed()) {
                    logger.info('v4.0.89: perte de focus document détectée — restauration clavier (win.focus + wakeVirtualKeyboard)');
                    this.wakeVirtualKeyboard();
                }
            }).catch(() => {});
        }, 3000);
        // v4.0.77: historique court des états — un pivot rapide A→B→A en moins
        // d'un tick ne doit pas être manqué (état intermédiaire détecté).
        this.recentDisplayKeys = [];
        this.rotationPoll = setInterval(() => {
            if (!this.win || this.win.isDestroyed()) return;
            try {
                const d = screen.getPrimaryDisplay();
                // v4.0.67: inclure la TAILLE RÉELLE de la fenêtre — sur UT/Wayland
                // le pivot redimensionne la surface (compositor) sans changer les
                // métriques de l'écran : seule la taille de la fenêtre bouge.
                const wb = this.win.getBounds();
                const key = `${d.rotation}|${d.size.width}x${d.size.height}|win ${wb.width}x${wb.height}`;
                // v4.0.85: ne déclencher QUE sur un vrai changement d'ORIENTATION
                // (portrait <-> paysage) — la clé de détection ne contient PAS la
                // taille de la fenêtre : au démarrage elle passe de 612x1350 à
                // 612x1298 (ajustement du chrome) sans changer d'orientation, ce
                // qui provoquait une fausse rotation et un quit 800 ms après le
                // lancement.
                const winLandscape = wb.width > wb.height;
                const keyOriented = `${winLandscape ? 'L' : 'P'}|${d.rotation}|${d.size.width}x${d.size.height}`;
                const first = this.lastDisplayKey === '';
                this.lastDisplayKey = key;
                if (first) { this.recentDisplayKeys = [keyOriented]; return; } // ne rien faire au démarrage
                // v4.0.77: déclenche si l'état courant n'a pas été vu récemment
                // (détecte A→B→A rapide) ; intervalle 500 ms pour la réactivité.
                if (!this.recentDisplayKeys.includes(keyOriented)) {
                    this.lastRotationTime = Date.now(); // v4.0.78: pour le watchdog liste vide
                    // v4.0.99: réécrire le flag de rotation pour le wrapper —
                    // depuis v4.0.94 l'app ne quitte plus au pivot, donc le
                    // wrapper ne voyait jamais de mort de heartbeat et la roue
                    // (relaunch.qml) n'était plus affichée.
                    try { fs.writeFileSync(ROTATION_RELAUNCH_FILE, String(Date.now())); } catch (e) { /* ignore */ }
                    this.recentDisplayKeys.push(keyOriented);
                    if (this.recentDisplayKeys.length > 4) this.recentDisplayKeys.shift();
                    logger.info(`v4.0.85: rotation détectée (${key}) — setBounds${this.mailListReady ? ' + toast + relance différée 800 ms' : ' (liste pas encore atteinte : PAS de quit)'}`);
                    this.handleDisplayChange();
                    try { this.win.webContents.invalidate(); } catch (e) {}
                    // v4.0.84: RELANCE COMPLÈTE de l'app après pivot — le reload de
                    // page ne suffisait pas (listbox 0x0 persistait aléatoirement).
                    // On quitte SANS le flag exitclient : le wrapper voit le heartbeat
                    // mort et relance l'app fraîche (launchtry). Garde-fou: 1 fois / 20 s.
                    // v4.0.85: le quit est BLOQUÉ tant que la liste des messages n'est
                    // pas atteinte (mailListReady) — sinon une fausse détection au
                    // démarrage empêche l'app de s'ouvrir.
                    const now = Date.now();
                    if (this.mailListReady && (!this.lastRotationReload || now - this.lastRotationReload > 20000)) {
                        this.showRotationToast();
                        // v4.0.87: notification système (persiste après la fermeture
                        // de l'app, contrairement au toast qui disparaît en 1,5 s)
                        this.sendUbportsNotification(t('overlay.rotationNotifyTitle'), t('overlay.rotation'));
                        this.lastRotationReload = now;
                        setTimeout(() => {
                            // v4.0.94: plus de app.exit(0) après rotation — le quit
                            // complet + relance par le wrapper provoquait des crashs
                            // (uncaughtException setProgressBar/webContents of null,
                            // 5 erreurs/60s -> exit(1)) et des SingletonLock laissés
                            // par l'ancienne instance qui empêchaient la nouvelle de
                            // démarrer. forceListRepaint (v4.0.66/4.0.81) résout déjà
                            // la liste vide 0x0 : un simple reload + repaint suffit.
                            if (!this.win || this.win.isDestroyed()) return;
                            logger.info('v4.0.94: rotation — reload page + repaint liste (quit complet supprimé)');
                            // v4.0.89: fermer le clavier virtuel avant le reload —
                            // sinon Maliit reste ouvert sur une page rechargée.
                            this.win.webContents.executeJavaScript(
                                'if (document.activeElement && document.activeElement.blur) document.activeElement.blur()'
                            ).catch(() => {});
                            this.win.reload();
                            // v4.0.94: repaint dès que la page rechargée est prête
                            // (did-finish-load) + repaints différés — sinon si le
                            // reload prend > 3 s, les repaints tombaient sur
                            // l'ancienne page et la liste restait 0x0.
                            const repaintSoon = () => this.forceListRepaint('post-rotation');
                            const onLoaded = () => { repaintSoon(); setTimeout(repaintSoon, 1500); };
                            this.win.webContents.once('did-finish-load', onLoaded);
                            setTimeout(repaintSoon, 2000);
                            setTimeout(repaintSoon, 5000);
                            setTimeout(repaintSoon, 8000);
                        }, 1000);
                    }
                }
            } catch (e) { /* ignore */ }
        }, 500);
    }

    handleDisplayChange() {
        if (!this.win || this.win.isDestroyed()) return;
        const primaryDisplay = screen.getPrimaryDisplay();
        const {width, height} = primaryDisplay.size;
        const isPortrait = height > width;
        // v4.0.80: sur UT/Wayland, screen.size ne change PAS au pivot (rotation
        // faite par le compositor) — la fenêtre, elle, passe en 1350x576. Il faut
        // donc respecter l'orientation COURANTE de la fenêtre, sinon on écrase
        // une fenêtre landscape en géométrie portrait → liste rendue en 0 px de
        // haut (lignes 0x0) et volet de nav qui ne couvre qu'une partie.
        const wb = this.win.getBounds();
        const winLandscape = wb.width > wb.height;
        const bw = winLandscape ? height : width;
        const bh = winLandscape ? width : height;
        logger.info(`Display changed: ${width}x${height} (${isPortrait ? 'portrait' : 'landscape'}), fenêtre ${wb.width}x${wb.height} -> setBounds ${bw}x${bh}`);
        // v3.3.82: en portrait (téléphone), la fenêtre DOIT remplir tout l'écran —
        // sinon la liste des messages s'arrête avant le bas de l'écran (fenêtre
        // créée en 1400x900 fixe).
        // v4.0.64: idem en PAYSAGE — avant, seul le portrait redimensionnait la
        // fenêtre, donc après un pivot en landscape la fenêtre gardait ses
        // anciennes bornes et la liste des messages était coupée/invisible.
        try { this.win.setBounds({x: 0, y: 0, width: bw, height: bh}); } catch (e) { logger.warn('setBounds failed:', e.message); }
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
                // v4.0.3: test actif immédiat pour distinguer « pas de réseau »
                // (serveur injoignable) de « le serveur ne répond pas » (login
                // indisponible alors que la connexion existe).
                this.checkServerReachable().then(reachable => {
                    this.showOfflineOverlay(reachable ? 'offline' : 'server');
                });
                this.startConnectivityMonitor();
            }
        });
    }

    // kind: 'offline' (no Internet) or 'server' (server/login not responding) — v4.0.3
    showOfflineOverlay(kind = 'offline') {
        if (!this.win || this.win.isDestroyed()) return;
        this.isOffline = true;
        const tr = getAllTranslations();
        const titleKey = kind === 'server' ? 'server.title' : 'offline.title';
        const messageKey = kind === 'server' ? 'server.message' : 'offline.message';

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
                        <h1 style="font-size:24px;font-weight:300;margin-bottom:12px;">${tr[titleKey]}</h1>
                        <p style="font-size:16px;opacity:0.7;margin-bottom:32px;line-height:1.5;">
                            ${tr[messageKey]}
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
        const notifKey = kind === 'server' ? 'notif.serverUnreachable.title' : 'notif.offline.title';
        this.sendUbportsNotification(t('app.name'), t(notifKey));
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
                // v4.0.3: navigator.onLine is NOT a real network test — in
                // Electron/Ubuntu Touch it often stays true even with no
                // connectivity (it only reflects Chromium's interface state).
                // Use a real request to the mail server instead.
                const reachable = await this.checkServerReachable();
                if (reachable) {
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

    // --- Server reachability test (v4.0.3) ---
    // Real in-app network test: an actual HTTP request to the mail/login
    // server. did-fail-load only fires during navigations and
    // navigator.onLine does not reflect real connectivity, so without this
    // the app never notices that the server (or the login) is down.

    /**
     * Teste réellement que le serveur mail/login répond (requête HTTP avec
     * timeout). Retourne true si le serveur répond (any HTTP status), false sinon.
     * @returns {Promise<boolean>}
     */
    async checkServerReachable() {
        const target = this.mainMailServiceUrl || settings.get('urlMainWindow') || 'https://outlook.office.com/';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await net.fetch(target, {
                method: 'HEAD',
                signal: controller.signal,
            });
            // Any HTTP response (even 3xx/4xx) means the server is alive.
            return res.status > 0;
        } catch (err) {
            logger.warn(`Server reachability check failed for ${target}: ${err.message}`);
            return false;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Moniteur périodique : teste le serveur toutes les 30s. Après 2 échecs
     * consécutifs, affiche l'écran « serveur ne répond pas » (si le login/la
     * page mail n'est pas disponible). Dès que le serveur répond à nouveau,
     * masque l'écran et notifie.
     */
    startServerMonitor() {
        if (this.serverMonitor) clearInterval(this.serverMonitor);
        // Premier test rapide après le lancement (le splash couvre les 30s,
        // ce test détecte un serveur down avant même la fin du chargement).
        setTimeout(() => this.runServerCheck(), 5000);

        this.serverMonitor = setInterval(() => this.runServerCheck(), 30000);
        logger.info('Server reachability monitor started (30s)');
    }

    async runServerCheck() {
        if (!this.win || this.win.isDestroyed()) return;
        const reachable = await this.checkServerReachable();
        if (!reachable) {
            this.serverFailCount++;
            logger.warn(`Server check failed (${this.serverFailCount}/2 consecutive)`);
            if (this.serverFailCount >= 2 && !this.serverWasUnreachable) {
                this.serverWasUnreachable = true;
                logger.warn('Server unreachable — showing "server not responding" screen');
                this.showOfflineOverlay('server');
            }
        } else {
            if (this.serverWasUnreachable) {
                logger.info('Server reachable again — hiding overlay');
                this.serverWasUnreachable = false;
                this.hideOfflineOverlay();
                this.sendUbportsNotification(t('app.name'), t('notif.serverReachable.title'));
            }
            this.serverFailCount = 0;
        }
    }

    async injectStyles(targetWin = null) {
        const win = targetWin || this.win;
        if (!win || win.isDestroyed()) return;
        // v3.3.20: per-window CSS keys (compose opens in a separate window and
        // must get the UT look too)
        if (!win.__utoutlookCssKeys) win.__utoutlookCssKeys = { main: null, noFrame: null, reading: null };
        const keys = win.__utoutlookCssKeys;

        // Remove previously inserted CSS
        for (const key of ['main', 'noFrame', 'reading']) {
            if (keys[key]) {
                try { await win.webContents.removeInsertedCSS(keys[key]); } catch (e) { /* ignore */ }
                keys[key] = null;
            }
        }

        // Insert fresh CSS
        // v3.3.21: base CSS only — no theme variants (dark/focus/accent removed,
        // user wants the plain UT look without themes).
        keys.main = await win.webContents.insertCSS(getClientFile("main.css"));
        if (!this.showWindowFrame) {
            keys.noFrame = await win.webContents.insertCSS(getClientFile("no-frame.css"));
        }
        // v3.3.25: reading font scale (message body), independent of global zoom
        const readingScale = settings.get('readingFontScale') || 1.0;
        if (readingScale !== 1.0) {
            keys.reading = await win.webContents.insertCSS(
                `[role="complementary"], [data-app-section*="ReadingPane" i], [class*="readingPane" i] ` +
                `{ font-size: ${readingScale}em !important; }`
            );
        }
    }

    async addUnreadNumberObserver() {
        if (!this.win || this.win.isDestroyed()) return;
        // Inject translations as a global before the observer script
        const tr = getAllTranslations();
        const i18nJson = JSON.stringify({
            newMessagesTitle: tr['notif.newMessages.title'],
            newMessagesBody: tr['notif.newMessages.body'],
            newMailTitle: tr['notif.newMail.title'],
            newMailBody: tr['notif.newMail.body'],
            newMailBodyNoSubject: tr['notif.newMail.bodyNoSubject'],
            calendarTitle: tr['notif.calendar.title'],
            appName: tr['app.name'],
            emptyTitle: tr['empty.title'],
            emptyBody: tr['empty.body'],
        });
        // executeJavaScript returns a Promise — catch rejections to avoid
        // unhandled rejections when the page is navigating or not ready.
        try {
            // v4.0.95: FUSIONNER (ne pas remplacer) — sinon une ré-injection
            // de l'observer (did-stop-loading / health check) écrase les clés
            // de gestures.js et du bouton « Recharger les messages » → libellé
            // retombé en anglais hardcodé quelques secondes après le chargement.
            await this.win.webContents.executeJavaScript(
                `window.__utoutlookI18n = Object.assign(window.__utoutlookI18n||{}, ${i18nJson});\n` +
                getClientFile("unread-number-observer.js")
            );
        } catch (err) {
            // Page may be navigating — will be re-injected by health check or next event
            logger.debug('Observer injection deferred (page not ready):', err.message);
        }
    }

    injectGestures(targetWin = null) {
        const win = targetWin || this.win;
        if (!win || win.isDestroyed()) return;
        // v3.3.50: inject the i18n strings used by the in-page scripts (login badge label)
        const tr = getAllTranslations();
        const i18nJson = JSON.stringify({
            loginMadeFor: tr['login.madeFor'],
            knownLogin: this.knownEmail || '',   // v3.3.57: pré-remplir le champ login (jamais loggé)
            firstInstall: tr['login.firstInstall'],           // v3.3.63: bouton first-install sur la page de login
            firstInstallConfirm: tr['login.firstInstallConfirm'],
            firstInstallConfirmAction: tr['login.firstInstallConfirmAction'],
            // v4.0.127: bouton « rendu logiciel » sur la page de login
            renderSoftwareEnable: tr['render.enable'],
            renderSoftwareDisable: tr['render.disable'],
        });
        win.webContents.executeJavaScript(
            `window.__utoutlookI18n = Object.assign(window.__utoutlookI18n||{}, ${i18nJson});\n` +
            getClientFile("gestures.js")
        ).catch(() => {
            // gestures.js may not exist yet or page not ready, ignore
        });
    }

    /**
     * v4.0.95: injecte la barre d'actions en bas de l'écran : « Recharger les
     * messages » (secours liste 0x0) et « Quitter » (vrai quit, wrapper inclus).
     * Libellés passés via window.__utoutlookI18n, comme gestures.js.
     */
    injectReloadButton() {
        if (!this.win || this.win.isDestroyed()) return;
        let script;
        try {
            script = getClientFile("reload-button.js");
        } catch (err) {
            // Fichier absent d'un asar plus ancien : ne pas casser le dom-ready.
            logger.warn('v4.0.95: reload-button.js introuvable — bouton non injecté', err.message);
            return;
        }
        const tr = getAllTranslations();
        const i18nJson = JSON.stringify({
            reloadMessages: tr['overlay.reloadMessages'],
            reloading: tr['overlay.reloading'], // feedback immédiat au clic
            quitApp: tr['common.quit'], // bouton Quitter (déjà traduit en 8 langues)
        });
        this.win.webContents.executeJavaScript(
            `window.__utoutlookI18n = Object.assign(window.__utoutlookI18n||{}, ${i18nJson});\n` + script
        ).catch(() => {
            // page not ready — sera réinjecté au prochain dom-ready / navigation
        });
    }

    /**
     * v4.0.95: rechargement manuel demandé par le bouton en bas de la liste.
     * Action utilisateur : on tente d'abord une réparation douce (fix layout +
     * repaint), puis on RECHARGE TOUJOURS la page — le bouton doit rafraîchir
     * les mails, pas seulement réparer une liste 0x0. Pas de garde-fou 30 s :
     * un clic est toujours honoré. Les reloads auto sont bloqués via un flag
     * DÉDIÉ (pas lastRotationReload, qui reste au détecteur de rotation).
     */
    async manualReloadMessages() {
        if (!this.win || this.win.isDestroyed() || this.manualReloadInProgress) return;
        this.manualReloadInProgress = true;
        try {
            logger.info('v4.0.95: rechargement manuel des messages (bouton en bas de liste)');
            this.showToast(t('overlay.reloading'));
            this.listEmptyCount = 0; // le watchdog ne doit pas conclure en parallèle
            this.lastListReload = Date.now(); // watchdog: pas de reload auto avant 60 s
            // Bloque le « dernier recours » auto de forceListRepaint (1,2 s)
            // pendant 5 s : la décision appartient à cette action, mais le
            // détecteur de rotation garde toute sa logique (20 s) intacte.
            this.autoReloadBlockedUntil = Date.now() + 5000;
            this.fixMailLayout();
            this.forceListRepaint('manual');
            // Laisse le repaint s'appliquer avant de recharger (feedback visuel).
            await new Promise(r => setTimeout(r, 600));
            if (!this.win || this.win.isDestroyed()) return;
            const url = this.win.webContents.getURL();
            // Ne jamais recharger une page non HTTP(S) (about:, file:).
            if (!/^https?:/i.test(url)) return;
            logger.info('v4.0.95: rechargement de la page demandé par le bouton');
            this.win.webContents.reload();
        } finally {
            this.manualReloadInProgress = false;
        }
    }

    /**
     * Bascule la visibilité de la fenêtre (show/hide).
     */
    toggleWindow() {
        if (!this.alive) return; // v4.1.0 (revue D19)
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
        if (!this.alive) return; // v4.1.0 (revue D19)
        this.initialMinimization.domReady = false;
        this.win.reload();
    }

    /**
     * v4.1.0: "re-surface" — sur UT/Lomiri, après un verrouillage/déverrouillage
     * ou un changement de session Mir, la fenêtre reste MapViewable côté X
     * (isVisible() === true, heartbeat actif) mais le shell ne compose plus sa
     * surface : l'app paraît fermée alors qu'elle vit. Forcer un passage
     * alwaysOnTop puis invalidate() oblige Mir à réintégrer la surface, sans
     * win.hide() (interdit : crash GPU FATAL sur UT, voir v4.0.39).
     */
    resurfaceWindow(stealFocus = false) {
        if (!this.alive || global.utoutlookQuitting) return;
        if (!this.win.isVisible()) {
            try { this.win.show(); } catch (e) { /* ignore */ }
        }
        try {
            this.win.setAlwaysOnTop(true);
            setTimeout(() => {
                if (this.alive) {
                    try { this.win.setAlwaysOnTop(false); } catch (e) { /* ignore */ }
                }
            }, 150);
        } catch (e) { /* ignore */ }
        try { this.win.webContents.invalidate(); } catch (e) { /* ignore */ }
        if (stealFocus) {
            try { this.win.focus(); } catch (e) { /* ignore */ }
        }
        logger.info('v4.1.0: window re-surfaced (alwaysOnTop pulse + invalidate)');
    }

    /**
     * Affiche la fenêtre principale (restore si minimisée).
     * Extrait également le token fb_dtsg de la page.
     */
    async show() {
        if (!this.alive) return; // v3.3.22
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
