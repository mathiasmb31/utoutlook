import net from 'node:net';
import fs from 'node:fs';
import {CONFIG_DIR, SOCKET_PATH} from './config.mjs';
import {logger} from './logger.mjs';

// ============================================================
// Unix socket server for shell ↔ Electron communication
//
// The shell wrapper (command.sh) sends JSON commands:
//   {"cmd":"quit"}              → quit the app
//   {"cmd":"zoom","factor":1.25} → set zoom factor
//   {"cmd":"zoomIn"}            → zoom in one step
//   {"cmd":"zoomOut"}           → zoom out one step
//   {"cmd":"zoomReset"}         → reset zoom to 100%
//   {"cmd":"text","data":"..."} → insert text into the webview
//   {"cmd":"reload"}            → reload the window
//
// Electron sends JSON responses back on the same socket:
//   {"ok":true} or {"ok":false,"error":"..."}
// ============================================================

let server = null;
let activeConnections = new Set();
// v4.3.7: connexions en long-poll (`hold`) du watchdog du wrapper.
// On garde la socket ET son timer pour pouvoir prevenir le wrapper des
// qu'il se quitte (cf. notifyQuitting) avant de fermer le serveur.
const heldSockets = new Map();

/**
 * v4.3.7: repond immediatement a tous les clients en long-poll que l'app
 * se quitte. Le wrapper sort alors SANS attendre le timer de 3 s ni la
 * fermeture du socket (indispensable pour un relance ~1 s apres fermeture).
 */
export function notifyQuitting() {
    for (const [sock, timer] of heldSockets) {
        clearTimeout(timer);
        if (sock && !sock.destroyed) {
            try { sock.write(JSON.stringify({ok: true, held: true, quitting: true}) + '\n'); }
            catch (e) { /* socket deja fermee */ }
        }
    }
    heldSockets.clear();
}

/**
 * Start the Unix socket server.
 * @param {Object} handlers - Command handlers
 * @param {Function} handlers.onQuit - Called on {"cmd":"quit"}
 * @param {Function} handlers.onZoom - Called on zoom commands, receives factor or direction
 * @param {Function} handlers.onText - Called on {"cmd":"text"}, receives data string
 * @param {Function} handlers.onReload - Called on {"cmd":"reload"}
 * @returns {net.Server}
 */
export function startSocketServer(handlers) {
    // Correctif CI : le dossier de config peut ne pas encore exister (runner
    // CI, premier demarrage, HOME vierge). net.listen() sur un socket dont le
    // parent est absent echoue en ENOENT de facon asynchrone — le test
    // "handleCommand processes quit" passait en local (dossier present) mais
    // echouait sur GitHub Actions (Node 22 et 24).
    try {
        fs.mkdirSync(CONFIG_DIR, {recursive: true, mode: 0o700});
    } catch (err) {
        logger.error('Cannot create config dir:', err);
    }
    // Remove stale socket file
    if (fs.existsSync(SOCKET_PATH)) {
        try { fs.unlinkSync(SOCKET_PATH); } catch (e) { /* ignore */ }
    }

    server = net.createServer((socket) => {
        activeConnections.add(socket);

        let buffer = '';
        socket.on('data', (data) => {
            buffer += data.toString();
            // v3.3.66: cap the buffer — a runaway client must not grow memory unbounded
            if (buffer.length > 1024 * 1024) {
                socket.destroy();
                return;
            }
            // Process complete JSON messages (newline-delimited)
            let newlineIdx;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);
                if (!line) continue;

                try {
                    const msg = JSON.parse(line);
                    const response = handleCommand(msg, handlers, socket);
                    if (response !== null) socket.write(JSON.stringify(response) + '\n');
                } catch (err) {
                    socket.write(JSON.stringify({ok: false, error: err.message}) + '\n');
                }
            }
        });

        socket.on('error', () => {
            activeConnections.delete(socket);
        });

        socket.on('close', () => {
            activeConnections.delete(socket);
        });
    });

    server.listen(SOCKET_PATH, () => {
        // v4.1.0 (revue C12): 0600 — le wrapper tourne sous le même UID que
        // l'app, aucun besoin d'ouvrir le socket à tous les processus locaux.
        try { fs.chmodSync(SOCKET_PATH, 0o600); } catch (e) { /* ignore */ }
        logger.info(`Socket server listening on ${SOCKET_PATH}`);
    });

    server.on('error', (err) => {
        logger.error('Socket server error:', err);
    });

    return server;
}

/**
 * Stop the socket server and clean up.
 */
export function stopSocketServer() {
    // v4.3.7: prevenir AVANT de detruire les connexions (cas app.exit direct).
    notifyQuitting();
    if (server) {
        for (const socket of activeConnections) {
            socket.destroy();
        }
        activeConnections.clear();
        server.close();
        server = null;
    }
    if (fs.existsSync(SOCKET_PATH)) {
        try { fs.unlinkSync(SOCKET_PATH); } catch (e) { /* ignore */ }
    }
}

/**
 * Handle a single JSON command.
 */
function handleCommand(msg, handlers, socket) {
    const {cmd} = msg;

    switch (cmd) {
        case 'quit':
            if (handlers.onQuit) handlers.onQuit();
            return {ok: true};

        case 'show':
            // v4.0.27: re-show the main window (launcher tap while app already running)
            if (handlers.onShow) handlers.onShow();
            return {ok: true};

        case 'zoom':
            if (handlers.onZoom) handlers.onZoom(msg.factor);
            return {ok: true};

        case 'zoomIn':
            if (handlers.onZoom) handlers.onZoom('in');
            return {ok: true};

        case 'zoomOut':
            if (handlers.onZoom) handlers.onZoom('out');
            return {ok: true};

        case 'zoomReset':
            if (handlers.onZoom) handlers.onZoom('reset');
            return {ok: true};

        case 'text':
            if (handlers.onText) handlers.onText(msg.data);
            return {ok: true};

        case 'reload':
            if (handlers.onReload) handlers.onReload();
            return {ok: true};

        case 'readingFont':
            if (handlers.onReadingFont) handlers.onReadingFont(msg.action);
            return {ok: true};

        case 'eval':
            // v4.1.0 (revue C12): arbitraire en release — uniquement en debug.
            if (process.env.UTOUTLOOK_DEBUG !== '1') {
                return {ok: false, error: 'eval disabled'};
            }
            // Debug: run JS in the renderer, reply asynchronously on the socket.
            if (handlers.onEval) {
                Promise.resolve(handlers.onEval(msg.code || ''))
                    .then(r => socket.write(JSON.stringify({ok: true, result: String(r).substring(0, 4000)}) + '\n'))
                    .catch(e => socket.write(JSON.stringify({ok: false, error: e.message}) + '\n'));
                return null; // deferred reply
            }
            return {ok: false, error: 'no onEval handler'};

        case 'ping':
            return {ok: true, pong: true};

        case 'hold':
            // v4.3.7: long-poll pour le watchdog du wrapper. On garde la
            // connexion ouverte `ms` millisecondes puis on repond held:true.
            // Si Electron meurt avant (quit propre), le socket se ferme : le
            // client C (socketcli) voit EOF et le wrapper reagit IMMEDIATEMENT,
            // sans sleep ni polling. Un event-loop bloque ne fait pas partir
            // ce timer, mais le timeout cote socketcli (5 s) prend le relais.
            {
                const ms = Math.max(100, Math.min(Number(msg.ms) || 3000, 10000));
                const replyTimer = setTimeout(() => {
                    heldSockets.delete(socket);
                    if (socket && !socket.destroyed) {
                        try { socket.write(JSON.stringify({ok: true, held: true}) + '\n'); }
                        catch (e) { /* socket fermee entre-temps */ }
                    }
                }, ms);
                heldSockets.set(socket, replyTimer);
                if (socket && socket.once) {
                    socket.once('close', () => {
                        clearTimeout(replyTimer);
                        heldSockets.delete(socket);
                    });
                }
                return null; // deferred reply (voir socket.on('data'))
            }

        default:
            return {ok: false, error: `Unknown command: ${cmd}`};
    }
}
