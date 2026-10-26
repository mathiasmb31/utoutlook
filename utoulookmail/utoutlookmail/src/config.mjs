import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

// ============================================================
// Centralized path configuration for Utoutlook Mail
// All hardcoded paths in the app should reference these.
// ============================================================

const PHABLET_HOME = '/home/phablet';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Ubuntu Touch click app directories ---
export const APP_ID = 'utoutlook.mathias';
export const CONFIG_DIR = path.join(PHABLET_HOME, '.config', 'utoutlook.mathias');
export const CACHE_DIR = path.join(PHABLET_HOME, '.cache', 'utoutlook.mathias');
export const DATA_DIR = path.join(CONFIG_DIR, 'data');

// --- Inter-process communication files (heartbeat, lifecycle) ---
export const HEARTBEAT_FILE = path.join(CONFIG_DIR, 'follow');
export const EXIT_CLIENT_FILE = path.join(CONFIG_DIR, 'exitclient');
export const KILLED_CLIENT_FILE = path.join(CONFIG_DIR, 'killedmail');
export const CLOSE_FLAG_FILE = path.join(CONFIG_DIR, 'close');
export const INIT_FLAG_FILE = path.join(CONFIG_DIR, 'init');
export const LOGIN_FLAG_FILE = path.join(CONFIG_DIR, 'login');
export const NOTIF_FLAG_FILE = path.join(CONFIG_DIR, 'notif');
export const RESET_FLAG_FILE = path.join(CONFIG_DIR, 'reset');
export const PID_FILE = path.join(DATA_DIR, '__prospect.pid');

// --- Language file (read by shell scripts for i18n) ---
export const LANG_FILE = path.join(CONFIG_DIR, 'lang');

// --- Unix socket for shell ↔ Electron commands ---
export const SOCKET_PATH = path.join(CONFIG_DIR, 'utoutlook.sock');

// --- Zoom / text injection (file-based triggers from shell/keyboard) ---
export const ZOOM_TRIGGER_GLOB = 'zoomtodo_*';
export const TEXT_TRIGGER_GLOB = 'sendMsg*';
export const ZOOM_RESET_FILE = path.join(CONFIG_DIR, 'reset');

// --- Electron singleton lock files (used by command.sh cleanup) ---
export const SINGLETON_DIR = path.join(CONFIG_DIR, 'prospect-mail');
export const SINGLETON_LOCK = path.join(SINGLETON_DIR, 'SingletonLock');
export const SINGLETON_COOKIE = path.join(SINGLETON_DIR, 'SingletonCookie');
export const SINGLETON_SOCKET = path.join(SINGLETON_DIR, 'SingletonSocket');

// --- Electron userData (set via app.setPath in main.mjs) ---
export function getUserDataDir() {
    // Lazy import: electron is only available inside the Electron runtime
    const {app} = require('electron');
    return path.join(app.getPath('appData'), 'prospect-mail');
}

// --- Asset paths (relative to the app root) ---
export const ASSETS_DIR = path.resolve(__dirname, '../../assets');
export const ICON_PATH = path.join(ASSETS_DIR, 'outlook_linux_black.png');
export const LOGO_PATH = '/opt/click.ubuntu.com/utoutlook.mathias/current/assets/logo.png';
