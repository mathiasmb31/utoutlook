// ============================================================
// logger.mjs — Centralized logging for Utoutlook Mail
// Replaces scattered console.log calls with leveled, timestamped output
// ============================================================

const LEVELS = {debug: 0, info: 1, warn: 2, error: 3};
const COLORS = {
    debug: '\x1b[36m',  // cyan
    info: '\x1b[32m',   // green
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',  // red
};
const RESET = '\x1b[0m';

let minLevel = LEVELS.info;

// Enable debug logging via environment variable
if (process.env.UTOUTLOOK_DEBUG === '1' || process.env.NODE_ENV === 'development') {
    minLevel = LEVELS.debug;
}

function formatMessage(level, args) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level] || '';
    const prefix = `${color}[${timestamp}] [${level.toUpperCase()}]${RESET}`;
    return [prefix, ...args];
}

export const logger = {
    debug(...args) {
        if (LEVELS.debug >= minLevel) console.log(...formatMessage('debug', args));
    },
    info(...args) {
        if (LEVELS.info >= minLevel) console.log(...formatMessage('info', args));
    },
    warn(...args) {
        if (LEVELS.warn >= minLevel) console.warn(...formatMessage('warn', args));
    },
    error(...args) {
        if (LEVELS.error >= minLevel) console.error(...formatMessage('error', args));
    },
    // Always log, regardless of level (for critical messages)
    always(...args) {
        console.log(...formatMessage('info', args));
    },
    setLevel(level) {
        if (LEVELS[level] !== undefined) minLevel = LEVELS[level];
    },
};

export default logger;
