import net from 'node:net';
import fs from 'node:fs';
import {SOCKET_PATH} from './config.mjs';
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
    // Remove stale socket file
    if (fs.existsSync(SOCKET_PATH)) {
        try { fs.unlinkSync(SOCKET_PATH); } catch (e) { /* ignore */ }
    }

    server = net.createServer((socket) => {
        activeConnections.add(socket);

        let buffer = '';
        socket.on('data', (data) => {
            buffer += data.toString();
            // Process complete JSON messages (newline-delimited)
            let newlineIdx;
            while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);
                if (!line) continue;

                try {
                    const msg = JSON.parse(line);
                    const response = handleCommand(msg, handlers);
                    socket.write(JSON.stringify(response) + '\n');
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
        // Make socket accessible to the phablet user
        try { fs.chmodSync(SOCKET_PATH, 0o666); } catch (e) { /* ignore */ }
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
function handleCommand(msg, handlers) {
    const {cmd} = msg;

    switch (cmd) {
        case 'quit':
            if (handlers.onQuit) handlers.onQuit();
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

        case 'ping':
            return {ok: true, pong: true};

        default:
            return {ok: false, error: `Unknown command: ${cmd}`};
    }
}
