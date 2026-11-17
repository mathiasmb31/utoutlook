import __Store from 'electron-store'
import {logger} from './logger.mjs';
import {LANGUAGES, detectLanguage} from './i18n.mjs';
import {LANG_FILE} from './config.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

export const Store = __Store.default || __Store

// ============================================================
// Settings validation helpers
// ============================================================

function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

function isValidStringArray(arr) {
    return Array.isArray(arr) && arr.every(item => typeof item === 'string' && item.length > 0);
}

// ============================================================
// Centralized settings store with defaults and validation
// ============================================================

const defaults = {
    // v3.3.17: keep outlook.office.com as the start URL — starting on
    // outlook.live.com opened the mailbox DIRECTLY when the session was valid
    // (auto-login), but the user wants the login page with the account tile to
    // click on, never an automatic sign-in.
    urlMainWindow: "https://outlook.office.com/mail",
    urlsInternal: [
        "outlook.live.com/mail/deeplink",
        "outlook.office365.com/mail/deeplink",
        "outlook.office.com/mail/deeplink",
        "outlook.cloud.microsoft/mail/deeplink",
        "outlook.office.com/calendar/deeplink",
        "outlook.cloud.microsoft/calendar/deeplink",
        "to-do.office.com/tasks",
    ],
    urlsExternal: [
        "outlook.com",
        "outlook.live.com",
        "outlook.office365.com",
        "outlook.office.com",
        "outlook.cloud.microsoft",
        // v4.0.50: domaines de LOGIN Microsoft — sans eux, un window.open() vers
        // login.live.com / login.microsoftonline.com partait dans le navigateur
        // EXTERNE (openExternalLink) : le token s'y posait mais jamais dans la
        // partition de l'app → retour systématique à la page de login.
        "login.live.com",
        "login.microsoftonline.com",
        "account.live.com",
        "account.microsoft.com",
        "cloud.microsoft",
        "microsoft.com",
        "microsoftonline.com",
        "live.com",
        "office.com",
        "office365.com",
        "msauth.net",
        "msftauth.net",
        "msocdn.com",
        "msecnd.net",
    ],
    safelinksUrls: [
        "outlook.office.com/mail/safelink.html",
        "safelinks.protection.outlook.com",
    ],
    // v4.0.23: on Ubuntu Touch the window behaves like a native app: full-screen
    // (no X11 frame) but hideOnClose=true — a swipe-close only HIDES the window
    // while the process keeps running (notifications keep flowing) and the next
    // launcher tap re-shows it instantly via the second-instance handler.
    // Forcing hideOnClose=false (v3.3.6) made the app DIE on every swipe, leaving
    // stale lifecycle flags that broke the next launch ("slow splash then exit").
    showWindowFrame: false,
    hideOnClose: true,
    hideOnMinimize: true,
    startMinimized: false,
    customBrowserPath: undefined,
    focusMode: false,
    // v3.3.25: reading font scale (message body), independent of the global zoom
    readingFontScale: 1.0,
    accentColor: '#0078d4',
    darkMode: 'auto',
    language: 'auto',
    // Multi-account support: each account has its own session partition (storage isolation)
    accounts: [
        {
            id: 'default',
            name: 'Primary account',
            url: 'https://outlook.office.com/mail',
            partition: 'persist:utoutlook-default',
            enabled: true,
        },
    ],
    activeAccountId: 'default',
};

export const settings = new Store({
    name: 'settings',
    clearInvalidConfig: true,
    defaults,
});

// Validate settings after load and fix invalid values
settings.onDidChange('urlMainWindow', (newValue) => {
    if (newValue && !isValidUrl(newValue)) {
        logger.warn(`Invalid urlMainWindow: ${newValue}, reverting to default`);
        settings.set('urlMainWindow', defaults.urlMainWindow);
    }
});

// v3.3.17: undo the v3.3.16 migration — live.com auto-logged-in when the session
// was valid; the user wants the select_account page with the tile to click on.
{
    const cur = settings.get('urlMainWindow');
    if (cur === 'https://outlook.live.com/mail/') {
        logger.warn('Migrating urlMainWindow live.com → office.com (no auto-login, v3.3.17)');
        settings.set('urlMainWindow', defaults.urlMainWindow);
    }
    const accounts = settings.get('accounts') || [];
    for (const acct of accounts) {
        if (acct.url === 'https://outlook.live.com/mail/') {
            acct.url = defaults.accounts[0].url;
            settings.set('accounts', accounts);
            logger.warn(`Migrating account ${acct.id} url live.com → office.com (v3.3.17)`);
        }
    }
}

// Validate on first access — check all URL arrays
for (const key of ['urlsInternal', 'urlsExternal', 'safelinksUrls']) {
    const value = settings.get(key);
    if (!isValidStringArray(value)) {
        logger.warn(`Invalid ${key}, reverting to default`);
        settings.set(key, defaults[key]);
    }
}

// v4.0.50: migration — fusionner les domaines de login Microsoft manquants dans
// urlsExternal (l'ancien settings.json a une liste valide mais incomplète, donc
// la validation ci-dessus ne la réinitialise pas). Sans login.live.com /
// login.microsoftonline.com, les popups OAuth partaient dans le navigateur externe.
{
    const cur = settings.get('urlsExternal');
    if (Array.isArray(cur)) {
        const missing = defaults.urlsExternal.filter(d => !cur.includes(d));
        if (missing.length > 0) {
            settings.set('urlsExternal', [...cur, ...missing]);
            logger.warn(`v4.0.50: migration urlsExternal — ${missing.length} domaines ajoutés (${missing.join(', ')})`);
        }
    }
}

// Validate boolean settings
for (const key of ['showWindowFrame', 'hideOnClose', 'hideOnMinimize', 'startMinimized', 'focusMode']) {
    const value = settings.get(key);
    if (typeof value !== 'boolean') {
        logger.warn(`Invalid ${key} (not boolean), reverting to default`);
        settings.set(key, defaults[key]);
    }
}

// v4.0.23: force native UT window behavior — showWindowFrame=false (no X11 cross)
// AND hideOnClose/hideOnMinimize=true so a swipe-close only hides the window and
// the process stays alive for notifications; relaunch is instant via second-instance.
// A persisted hideOnClose=false from an old version made the app DIE on every swipe
// (stale lifecycle flags → next launch slow-then-exit). startMinimized is forced
// false (a persisted true from pre-3.0 made the main window never appear).
for (const [key, val] of [['showWindowFrame', false], ['hideOnClose', true], ['hideOnMinimize', true], ['startMinimized', false]]) {
    if (settings.get(key) !== val) {
        logger.warn(`Forcing ${key}=${val} (was ${settings.get(key)})`);
        settings.set(key, val);
    }
}

// v4.0.10 (fix upgrade from < 3.0): a settings.json persisted by v2.x could carry
// startMinimized=true. MailWindowController then never shows the main window when
// the splash closes → the app runs invisible ("stuck on the splash screen" /
// transparent screen, OpenStore review on 4.0.9 after upgrading from 2.1.1).
// startMinimized only makes sense for an autostart context, which does not exist
// on Ubuntu Touch — force it off at every startup (runtime toggles still work
// until the next restart).
if (settings.get('startMinimized') !== false) {
    logger.warn(`Forcing startMinimized=false (stale value from a pre-3.0 settings.json; was ${settings.get('startMinimized')})`);
    settings.set('startMinimized', false);
}

// Validate accentColor (hex color)
{
    const color = settings.get('accentColor');
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        logger.warn(`Invalid accentColor: ${color}, reverting to default`);
        settings.set('accentColor', defaults.accentColor);
    }
}

// Validate darkMode (auto | on | off)
{
    const mode = settings.get('darkMode');
    if (!['auto', 'on', 'off'].includes(mode)) {
        logger.warn(`Invalid darkMode: ${mode}, reverting to default`);
        settings.set('darkMode', defaults.darkMode);
    }
}

// Validate accounts array
{
    const accounts = settings.get('accounts');
    if (!Array.isArray(accounts) || accounts.length === 0) {
        logger.warn('Invalid accounts (empty or not array), reverting to default');
        settings.set('accounts', defaults.accounts);
    } else {
        // Ensure each account has required fields
        const validAccounts = accounts.filter(a =>
            a && typeof a.id === 'string' && typeof a.name === 'string' &&
            typeof a.url === 'string' && isValidUrl(a.url) &&
            typeof a.partition === 'string'
        );
        if (validAccounts.length === 0) {
            logger.warn('No valid accounts found, reverting to default');
            settings.set('accounts', defaults.accounts);
        } else if (validAccounts.length !== accounts.length) {
            logger.warn(`Filtered ${accounts.length - validAccounts.length} invalid account(s)`);
            settings.set('accounts', validAccounts);
        }
        // Ensure enabled defaults to true if missing
        for (const acct of validAccounts) {
            if (typeof acct.enabled !== 'boolean') acct.enabled = true;
        }
    }
}

// Validate activeAccountId
{
    const activeId = settings.get('activeAccountId');
    const accounts = settings.get('accounts');
    if (!accounts.some(a => a.id === activeId)) {
        logger.warn(`Invalid activeAccountId: ${activeId}, reverting to first account`);
        settings.set('activeAccountId', accounts[0]?.id || 'default');
    }
}

// ============================================================
// Language setting + lang file for shell scripts
// ============================================================

// Cache for the Electron app reference (avoids repeated require calls)
let cachedApp = null;

/**
 * Resolve the effective language code from the setting.
 * @returns {string} Language code (fr, en, es, ...)
 */
export function resolveLanguage() {
    const lang = settings.get('language') || 'auto';
    if (lang === 'auto') {
        // Detect from Electron's locale (set by the OS)
        try {
            if (!cachedApp) {
                cachedApp = require('electron').app;
            }
            return detectLanguage(cachedApp.getLocale());
        } catch {
            return detectLanguage(process.env.LANG || 'fr');
        }
    }
    return LANGUAGES[lang] ? lang : 'fr';
}

/**
 * Write the current language to a file so shell scripts can read it.
 */
export function writeLangFile() {
    const lang = resolveLanguage();
    try {
        fs.mkdirSync(path.dirname(LANG_FILE), {recursive: true});
        fs.writeFileSync(LANG_FILE, lang, 'utf-8');
    } catch (err) {
        logger.warn('Failed to write lang file:', err.message);
    }
}

// Validate language setting
{
    const lang = settings.get('language');
    if (lang !== 'auto' && !LANGUAGES[lang]) {
        logger.warn(`Invalid language: ${lang}, reverting to auto`);
        settings.set('language', 'auto');
    }
}

// Write lang file on startup and whenever language changes
writeLangFile();
settings.onDidChange('language', () => {
    writeLangFile();
    logger.info(`Language changed to: ${resolveLanguage()}`);
});
