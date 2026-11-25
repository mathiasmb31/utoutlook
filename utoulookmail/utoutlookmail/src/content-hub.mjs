import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {PHABLET_HOME, CACHE_DIR, CONFIG_DIR, INCOMING_DIR} from './config.mjs';

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
    INCOMING_DIR,
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

const CONTENT_HUB_SERVICE = 'com.lomiri.content.dbus.Service';
const TRANSFER_INTERFACE = 'com.lomiri.content.dbus.Transfer';

/** Extrait les paires (id, libellé) du `av` retourné par KnownSourcesForType. */
export function parsePeers(text) {
    if (typeof text !== 'string') return [];
    const out = [];
    const add = (id, name) => {
        if (id && !out.some(p => p.id === id)) out.push({id, name: name || ''});
    };
    // Format gdbus : ('id', 'name', ...)
    for (const m of text.matchAll(/\('([^']+)',\s*'([^']*)'/g)) add(m[1], m[2]);
    // Format dbus-send --print-reply : string "id" / string "name"
    for (const m of text.matchAll(/string\s+"([^"]+)"\s+string\s+"([^"]*)"/g)) add(m[1], m[2]);
    return out;
}

/** Extrait les URLs file:// d'un `av` retourné par Collect(). */
export function parseCollectedUrls(text) {
    if (typeof text !== 'string') return [];
    return [...text.matchAll(/file:\/\/[^\s'"\),]+/g)].map(m => m[0]);
}

/**
 * v4.7.6: argument `av` de Charge() en notation GVariant.
 * Structure reelle de com::lomiri::content::Item (vue dans item.cpp amont) :
 *   (streamType: s, stream: ay, name: s, url: s)
 * L'URL est donc le 4e champ : `[<("", @ay [], "", "file://…")>]`.
 * Les formats precedents mettaient l'URL en 1er champ (streamType) : le
 * service chargeait un item avec une url vide, copiait rien, et le
 * destinataire affichait le nom de fichier '.' (screenshot 25/11).
 */
export function gvariantStringArray(items) {
    const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
    return '[' + list.map((u) =>
        `<("", @ay [], "", ${JSON.stringify(String(u))})>`).join(', ') + ']';
}

/** Extrait le chemin d'objet retourné par CreateImportFromPeer. */
export function parseObjectPath(text) {
    // dbus-send : `object path "/..."` ; gdbus : `objectpath '/...'`
    const m = typeof text === 'string' &&
        text.match(/(?:objectpath|object\s+path)\s+["']([^"']+)["']/);
    return m ? m[1] : null;
}

// v4.5.5: gdbus appelle org.freedesktop.DBus.Introspectable sur l'objet avant
// d'envoyer la méthode — AppArmor le refuse sur /transfers/** sous le click,
// ce qui faisait timeout le Collect(). dbus-send n'introspecte pas.
function defaultRun(args) {
    return new Promise((resolve, reject) => {
        const bin = path.join(process.env.WD || '', 'bin', 'dbus-send');
        execFile(bin, args, {timeout: 8000, maxBuffer: 8 * 1024 * 1024},
            (err, stdout) => err ? reject(err) : resolve(String(stdout)));
    });
}

// v4.7.0: Charge() prend un `av` que dbus-send sait passer en argument
// mais pas construire — gdbus, lui, comprend la notation GVariant. Verifie
// sous le profil AppArmor du click (gdbus embarque dans bin/).
function defaultGvRun(args) {
    return new Promise((resolve, reject) => {
        const bin = path.join(process.env.WD || '', 'bin', 'gdbus');
        execFile(bin, args, {timeout: 8000, maxBuffer: 8 * 1024 * 1024},
            (err, stdout) => err ? reject(err) : resolve(String(stdout)));
    });
}

export class ContentHubBridge {
    constructor({
        run = defaultRun,
        gvRun = defaultGvRun,
        appId,
        typeId = 'documents',
        timeout = TRANSFER_TIMEOUT_MS,
        sleep = (ms) => new Promise(r => setTimeout(r, ms)),
        now = () => Date.now(),
        validate = validateTransferPath,
        debug = null,
        stage = null,
        fsApi = fs,
        incomingDir = INCOMING_DIR,
    } = {}) {
        this.run = run;
        this.gvRun = gvRun;
        this.validate = validate;
        this.debug = debug;
        this.stage = stage;
        this.fsApi = fsApi;
        this.incomingDir = incomingDir;
        this.appId = appId;
        this.typeId = typeId;
        this.timeout = timeout;
        this.sleep = sleep;
        this.now = now;
    }

    call(method, args = [], objectPath = '/', iface = CONTENT_HUB_SERVICE) {
        return this.run([
            '--session',
            `--dest=${CONTENT_HUB_SERVICE}`,
            '--type=method_call',
            '--print-reply',
            objectPath,
            `${iface}.${method}`,
            ...args.map((a) => `string:${a}`),
        ]);
    }

    /** v4.7.0: appel de methode avec des arguments GVariant (gdbus). */
    callGv(method, gvArgs = [], objectPath = '/', iface = CONTENT_HUB_SERVICE) {
        return this.gvRun([
            'call', '--session',
            `--dest=${CONTENT_HUB_SERVICE}`,
            `--object-path=${objectPath}`,
            `--method=${iface}.${method}`,
            ...gvArgs,
        ]);
    }

    /** v4.7.0: destination d'export : le gestionnaire de fichiers si present. */
    async pickDestination() {
        const peers = parsePeers(await this.call('KnownDestinationsForType', [this.typeId]));
        if (!peers.length) return null;
        return peers.find((p) => /filemanager/i.test(p.id)) || peers[0];
    }

    /**
     * v4.7.0: partager un fichier local vers une autre app via Content Hub.
     * On ne finalize pas : le transfert doit rester vivant le temps que
     * l'utilisateur choisisse la destination dans le selecteur du service.
     */
    async exportFile(filePath) {
        const mark = (s) => { if (this.stage) this.stage(s); };
        const peer = await this.pickDestination();
        if (!peer) return {ok: false, error: 'no-destination'};
        mark(`destination=${peer.id}`);
        const obj = parseObjectPath(await this.call('CreateExportToPeer',
            [peer.id, this.appId, this.typeId]));
        if (!obj) return {ok: false, error: 'no-transfer'};
        mark('transfer-created');
        try {
            // v4.7.4: ordre correct — Start() first (état 0→2), puis Charge()
            // (état 2→3). Charge avant Start faisait rétrograder l'état 3→2 et
            // le picker se comportait comme un import (choix d'un fichier).
            await this.call('Start', [], obj, TRANSFER_INTERFACE);
            mark('started');
            const url = 'file://' + encodeURI(filePath);
            await this.callGv('Charge', [gvariantStringArray([url])], obj, TRANSFER_INTERFACE);
            mark('charged');
            return {ok: true};
        } catch (e) {
            // v4.7.7: e.message contient la ligne de commande gdbus avec
            // file://<chemin> — donnée personnelle, jamais journalisée.
            const code = e.code || 'export-failed';
            mark(`export-failed:${code}`);
            try { await this.call('Abort', [], obj, TRANSFER_INTERFACE); } catch (_) {}
            return {ok: false, error: code};
        }
    }

    /** Choisit une source : le gestionnaire de fichiers si présent, sinon la 1re. */
    async pickSource() {
        const peers = parsePeers(await this.call('KnownSourcesForType', [this.typeId]));
        if (!peers.length) return null;
        return peers.find(p => /filemanager/i.test(p.id)) || peers[0];
    }

    async importFiles() {
        const mark = (s) => { if (this.stage) this.stage(s); };
        mark('pick-source');
        const peer = await this.pickSource();
        if (!peer) { mark('no-source'); return {paths: [], error: 'no-source'}; }
        mark(`source=${peer.id}`);
        const obj = parseObjectPath(await this.call('CreateImportFromPeer',
            [peer.id, this.appId, this.typeId]));
        if (!obj) { mark('no-transfer'); return {paths: [], error: 'no-transfer'}; }
        mark('transfer-created');

        try {
            await this.call('Start', [], obj, TRANSFER_INTERFACE);
            mark('started');
            const deadline = this.now() + this.timeout;
            let lastError = '';
            let lastRaw = '';
            while (this.now() < deadline) {
                await this.sleep(200);
                // v4.5.9: NE PAS appeler Collect() avant l'etat charged —
                // Collect() fait passer le transfert a 'collected' des la
                // premiere appel et empeche le gestionnaire de fichiers de
                // charger la PJ.
                let stateRaw = '';
                try {
                    stateRaw = String(await this.call('State', [], obj, TRANSFER_INTERFACE));
                } catch (e) { lastError = e.message || 'state-failed'; }
                const sm = stateRaw.match(/int32\s+(\d+)/);
                const state = sm ? Number(sm[1]) : -1;
                if (state !== this._lastState) { mark(`state=${state}`); this._lastState = state; }
                const ready = [3, 4, 7, 8].includes(state); // charged/collected/downloading/downloaded
                if (!ready) continue;
                let collected = '';
                try {
                    collected = await this.call('Collect', [], obj, TRANSFER_INTERFACE);
                    lastRaw = String(collected);
                } catch (e) { lastError = e.message || 'collect-failed'; }
                const paths = parseCollectedUrls(collected)
                    .map(normalizeContentUrl)
                    .map(this.validate)
                    .filter(r => r.ok)
                    .map(r => r.path);
                if (paths.length) {
                    mark(`collected=${paths.length}`);
                    // Copier avant Finalize() : le service purge son cache au finalize.
                    const saved = [];
                    try {
                        this.fsApi.mkdirSync(this.incomingDir, {recursive: true});
                        for (const p of paths) {
                            const name = path.basename(p);
                            const ext = path.extname(name);
                            let dest = path.join(this.incomingDir, name);
                            let n = 1;
                            // v4.7.7: deux PJ homonymes ne doivent pas s'ecraser.
                            while (this.fsApi.existsSync && this.fsApi.existsSync(dest)) {
                                dest = path.join(this.incomingDir,
                                    `${path.basename(name, ext)}-${n++}${ext || '.bin'}`);
                            }
                            this.fsApi.copyFileSync(p, dest);
                            saved.push(dest);
                        }
                        mark(`saved=${saved.length}`);
                    } catch (e) {
                        mark(`copy-failed:${e.code || 'io-error'}`);
                        return {paths: [], error: 'copy-failed'};
                    }
                    return {paths: saved};
                }
            }
            if (this.debug) {
                this.debug(`Collect brut (masqué) : ${lastRaw.replace(/file:\/\/[^\s"')]+/g, 'file://…').slice(0, 260)}`);
            }
            mark(`timeout(${lastError || 'no-items'})`);
            return {paths: [], error: lastError || 'timeout'};
        } finally {
            try { await this.call('Finalize', [], obj, TRANSFER_INTERFACE); } catch (_) {}
        }
    }

}
