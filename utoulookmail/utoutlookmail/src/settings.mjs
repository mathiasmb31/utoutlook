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
    urlMainWindow: "https://outlook.office.com/mail",
    urlsInternal: [
        "outlook.live.com/mail/deeplink",
        "outlook.office365.com/mail/deeplink",
        "outlook.office.com/mail/deeplink",
        "outlook.office.com/calendar/deeplink",
        "to-do.office.com/tasks",
    ],
    urlsExternal: [
        "outlook.live.com",
        "outlook.office365.com",
        "outlook.office.com",
    ],
    safelinksUrls: [
        "outlook.office.com/mail/safelink.html",
        "safelinks.protection.outlook.com",
    ],
    showWindowFrame: true,
    hideOnClose: true,
    hideOnMinimize: true,
    startMinimized: false,
    customBrowserPath: undefined,
    focusMode: false,
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

// Validate on first access — check all URL arrays
for (const key of ['urlsInternal', 'urlsExternal', 'safelinksUrls']) {
    const value = settings.get(key);
    if (!isValidStringArray(value)) {
        logger.warn(`Invalid ${key}, reverting to default`);
        settings.set(key, defaults[key]);
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

/**
 * Resolve the effective language code from the setting.
 * @returns {string} Language code (fr, en, es, ...)
 */
export function resolveLanguage() {
    const lang = settings.get('language') || 'auto';
    if (lang === 'auto') {
        // Detect from Electron's locale (set by the OS)
        try {
            const {app} = require('electron');
            return detectLanguage(app.getLocale());
        } catch {
            return detectLanguage(process.env.LANG || 'fr');
        }
    }
    return LANGUAGES[lang] ? lang : 'fr';
}

/**
 * Write the current language to a file so shell scripts can read it.
 */
function writeLangFile() {
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
