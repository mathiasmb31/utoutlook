import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

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

// --- Language file (read by shell scripts for i18n) ---
export const LANG_FILE = path.join(CONFIG_DIR, 'lang');

// --- Unix socket for shell ↔ Electron commands ---
export const SOCKET_PATH = path.join(CONFIG_DIR, 'utoutlook.sock');

// v3.3.28: mark a DELIBERATE quit (window closed by the user / OS swipe,
// SIGTERM/SIGINT, socket quit) by writing the exitclient flag SYNCHRONOUSLY
// before exiting. The shell wrapper (command.sh) reads this flag to tell a
// clean quit apart from a crash — an async writeFile raced app.exit(0) and
// never landed, so the wrapper relaunched the app after a swipe-close.
export function markCleanExit() {
    // v4.0.17: embed the WRAPPER pid (UTOUTLOOK_WRAPPER_PID env, stable for the
    // whole wrapper lifetime) rather than our own process pid — the wrapper may
    // relaunch us several times and CLIENT_PID changes, but the wrapper pid does
    // not, so the flag always identifies "a clean quit of a process I launched".
    const wid = process.env.UTOUTLOOK_WRAPPER_PID || String(process.pid);
    try { fs.writeFileSync(EXIT_CLIENT_FILE, `quitclient:${wid}`); } catch (e) { /* ignore */ }
}

// --- Asset paths (relative to the app root) ---
export const ASSETS_DIR = path.resolve(__dirname, '../../assets');
export const ICON_PATH = path.join(ASSETS_DIR, 'outlook_linux_black.png');
