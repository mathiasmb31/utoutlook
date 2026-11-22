import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {PHABLET_HOME, CACHE_DIR} from './config.mjs';

// v4.4 — pont Content Hub reel : le click declare content-hub.json et on parle
// au service D-Bus directement (aucun QML visible, regle §2.14). Ce module
// contient la validation du chemin recu ET le pont de transfert.
export const TRANSFER_TIMEOUT_MS = 30000;
// v4.4.2: au-dela, le base64 injecte dans executeJavaScript peut geler/OOM le
// renderer. Au-dessus, on refuse le fichier avec une raison explicite.
export const MAX_TRANSFER_BYTES = 20 * 1024 * 1024;

// Racines ou le shell/Content Hub rend typiquement les fichiers sous UT 24.04.
// Derivees de config.mjs (plus de /home/phablet en dur) — marche aussi sur desktop.
export const DEFAULT_ALLOWED_ROOTS = [
    path.join(PHABLET_HOME, 'Downloads'),
    path.join(PHABLET_HOME, 'Documents'),
    path.join(PHABLET_HOME, 'Pictures'),
    path.join(PHABLET_HOME, 'Videos'),
    // Store() du service renvoie par defaut ce dossier DANS LE CACHE du click.
    path.join(CACHE_DIR, 'HubIncoming'),
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
        const st = fsApi.statSync(normalized);
        if (!st.isFile()) return {ok: false, reason: 'not-a-file'};
        // v4.4.2: les faux stat des tests n'ont pas de champ size — on ignore.
        if (typeof st.size === 'number' && st.size > MAX_TRANSFER_BYTES) {
            return {ok: false, reason: 'too-large'};
        }
    } catch (e) {
        return {ok: false, reason: 'not-readable'};
    }
    return {ok: true, path: normalized};
}

// ============================================================
// v4.4 — pont D-Bus vers com.lomiri.content.dbus.Service.
// Introspection device 22/11 : le service est sur l'objet '/', les transferts
// sont des objets /transfers/... avec Start/Collect/Charge/Finalize/Abort.
// Aucun QML visible : pas de risque unknown.qtmir / icône jaune.
// ============================================================

export const CONTENT_HUB_SERVICE = 'com.lomiri.content.dbus.Service';
export const TRANSFER_INTERFACE = 'com.lomiri.content.dbus.Transfer';

/** Extrait les paires (id, libellé) du `av` retourné par KnownSourcesForType. */
export function parsePeers(text) {
    if (typeof text !== 'string') return [];
    const out = [];
    for (const m of text.matchAll(/\('([^']+)',\s*'([^']*)'/g)) {
        if (m[1] && !out.some(p => p.id === m[1])) out.push({id: m[1], name: m[2] || ''});
    }
    return out;
}

/** Extrait les URLs file:// d'un `av` retourné par Collect(). */
export function parseCollectedUrls(text) {
    if (typeof text !== 'string') return [];
    return [...text.matchAll(/file:\/\/[^\s'"\),]+/g)].map(m => m[0]);
}

/** Extrait le chemin d'objet retourné par CreateImportFromPeer. */
export function parseObjectPath(text) {
    const m = typeof text === 'string' && text.match(/objectpath\s+'([^']+)'/);
    return m ? m[1] : null;
}

function defaultRun(args) {
    return new Promise((resolve, reject) => {
        const bin = path.join(process.env.WD || '', 'bin', 'gdbus');
        execFile(bin, args, {timeout: 8000, maxBuffer: 8 * 1024 * 1024},
            (err, stdout) => err ? reject(err) : resolve(String(stdout)));
    });
}

export class ContentHubBridge {
    constructor({
        gdbus,                         // conservé pour les tests / surcharge
        run = defaultRun,
        appId,
        typeId = 'documents',
        timeout = TRANSFER_TIMEOUT_MS,
        sleep = (ms) => new Promise(r => setTimeout(r, ms)),
        now = () => Date.now(),
        validate = validateTransferPath,
    } = {}) {
        this.run = run;
        this.validate = validate;
        this.appId = appId;
        this.typeId = typeId;
        this.timeout = timeout;
        this.sleep = sleep;
        this.now = now;
    }

    call(method, args = [], objectPath = '/', iface = CONTENT_HUB_SERVICE) {
        return this.run([
            'call', '--session',
            '--dest', CONTENT_HUB_SERVICE,
            '--object-path', objectPath,
            '--method', `${iface}.${method}`,
            ...args.map(String),
        ]);
    }

    /** Choisit une source : le gestionnaire de fichiers si présent, sinon la 1re. */
    async pickSource() {
        const peers = parsePeers(await this.call('KnownSourcesForType', [this.typeId]));
        if (!peers.length) return null;
        return peers.find(p => /filemanager/i.test(p.id)) || peers[0];
    }

    async importFiles() {
        const peer = await this.pickSource();
        if (!peer) return {paths: [], error: 'no-source'};
        const obj = parseObjectPath(await this.call('CreateImportFromPeer',
            [peer.id, this.appId, this.typeId]));
        if (!obj) return {paths: [], error: 'no-transfer'};

        try {
            await this.call('Start', [], obj, TRANSFER_INTERFACE);
            const deadline = this.now() + this.timeout;
            let lastError = '';
            while (this.now() < deadline) {
                await this.sleep(200);
                let collected = '';
                try {
                    collected = await this.call('Collect', [], obj, TRANSFER_INTERFACE);
                } catch (e) { lastError = e.message || 'collect-failed'; }
                const paths = parseCollectedUrls(collected)
                    .map(normalizeContentUrl)
                    .map(this.validate)
                    .filter(r => r.ok)
                    .map(r => r.path);
                if (paths.length) return {paths};
            }
            return {paths: [], error: lastError || 'timeout'};
        } finally {
            try { await this.call('Finalize', [], obj, TRANSFER_INTERFACE); } catch (_) {}
        }
    }

    async abort(obj) {
        try { await this.call('Abort', [], obj, TRANSFER_INTERFACE); } catch (_) {}
    }
}
