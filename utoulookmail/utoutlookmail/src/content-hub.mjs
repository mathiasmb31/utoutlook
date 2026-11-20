import fs from 'node:fs';
import path from 'node:path';

// v4.3.7 — PREPARATION Content Hub (aucun appel D-Bus n'est encore cable).
// Le click declare deja content-hub.json + content_exchange/source dans
// l'AppArmor, mais aucun code Electron n'utilise le hook. Avant de brancher un
// picker (QML visible = icone jaune, regle §2.14), on isole la seule partie
// verifiable sans device : la validation du chemin de fichier recu.
export const TRANSFER_TIMEOUT_MS = 30000;

// Racines ou le shell/Content Hub rend typiquement les fichiers sous UT 24.04.
// A confirmer sur device (gdbus + test reel) avant de brancher le picker.
export const DEFAULT_ALLOWED_ROOTS = [
    '/home/phablet/Downloads',
    '/home/phablet/Documents',
    '/home/phablet/Pictures',
    '/home/phablet/Videos',
];

export function normalizeContentUrl(raw) {
    if (typeof raw !== 'string') return null;
    let value = raw.trim();
    if (value.startsWith('file://')) value = value.slice(7);
    else if (value.startsWith('file:')) value = value.slice(5);
    try { value = decodeURIComponent(value); } catch (e) { /* laisse tel quel */ }
    return value || null;
}

/**
 * Valide un chemin recu via ContentTransfer.Charged avant de le donner a
 * Outlook Web. Pas decontamination de contenu : uniquement structure.
 * @returns {{ok: true, path: string} | {ok: false, reason: string}}
 */
export function validateTransferPath(raw, {
    allowedRoots = DEFAULT_ALLOWED_ROOTS,
    fsApi = fs,
    pathApi = path,
} = {}) {
    const value = normalizeContentUrl(raw);
    if (!value || !pathApi.isAbsolute(value)) return {ok: false, reason: 'invalid-path'};

    const normalized = pathApi.normalize(value);
    const inside = allowedRoots.some(root =>
        normalized === root || normalized.startsWith(root.endsWith(pathApi.sep)
            ? root : root + pathApi.sep));
    if (!inside) return {ok: false, reason: 'outside-allowed-roots'};

    try {
        if (!fsApi.statSync(normalized).isFile()) return {ok: false, reason: 'not-a-file'};
    } catch (e) {
        return {ok: false, reason: 'not-readable'};
    }
    return {ok: true, path: normalized};
}
