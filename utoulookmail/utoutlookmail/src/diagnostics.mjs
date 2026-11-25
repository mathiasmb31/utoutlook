import fs from 'node:fs';
import path from 'node:path';
import {CONFIG_DIR, DATA_DIR, HEARTBEAT_FILE} from './config.mjs';

// v4.3.7: rapport de diagnostic WHITELISTE. Le wrapper.log brut n'est PAS
// exportable : il contient titres/sujets de notifications (i18n notif.newMail)
// et sorties console du renderer (expediteurs, sujets, URLs de login).
// Ici uniquement des donnees structurelles : versions, etats, compteurs,
// tailles de fichiers. Aucune URL, aucun contenu de message, aucun cookie.
const FLAG_FILES = [
    'exitclient', 'killedmail', 'wrapper-quit', 'rotation-relaunch',
    'swipe-hidden', 'init', 'login', 'notif', 'close',
];

export function buildDiagnostics({
    version = 'unknown',
    configDir = CONFIG_DIR,
    dataDir = DATA_DIR,
    heartbeatFile = HEARTBEAT_FILE,
    now = Date.now,
    readFileSync = fs.readFileSync,
    existsSync = fs.existsSync,
    statSync = fs.statSync,
} = {}) {
    const readSmall = (p, max) => {
        try { return String(readFileSync(p, 'utf8')).trim().slice(0, max); }
        catch (e) { return null; }
    };
    const sizeOf = (p) => {
        try { return statSync(p).size; }
        catch (e) { return -1; }
    };
    const flags = {};
    for (const name of FLAG_FILES) flags[name] = existsSync(path.join(configDir, name));

    return {
        schema: 1,
        generatedAt: new Date(now()).toISOString(),
        app: 'utoutlook.mathias',
        version,
        language: readSmall(path.join(configDir, 'lang'), 8),
        renderMode: readSmall(path.join(configDir, 'render-mode'), 16),
        heartbeat: readSmall(heartbeatFile, 12),
        wrapperPidPresent: existsSync(path.join(dataDir, 'wrapper.pid')),
        socketPresent: existsSync(path.join(configDir, 'utoutlook.sock')),
        flags,
        logBytes: {
            wrapper: sizeOf(path.join(configDir, 'wrapper.log')),
            crash: sizeOf(path.join(configDir, 'crash.log')),
        },
    };
}
