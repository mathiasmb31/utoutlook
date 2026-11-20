import fs from 'node:fs';

// v4.3.7: supervision inverse wrapper <- Electron.
// Le wrapper surveille deja le heartbeat Electron toutes les 3 s, mais rien
// ne detectait la mort du wrapper (SIGKILL Lomiri) : Electron restait vivant
// avec un heartbeat actif = "app vivante mais invisible" + notifications
// orphelines. Ce module est PUR (aucune dependance Electron) et testable.

/**
 * Verifie que le wrapper qui a lance cette instance est toujours vivant.
 * @param {Object} options
 * @param {string} options.pidFilePath - chemin du fichier wrapper.pid
 * @param {string|number} options.expectedPid - PID transmis par UTOUTLOOK_WRAPPER_PID
 * @param {Function} [options.readFileSync] - injectable pour les tests
 * @param {Function} [options.readProc] - injectable pour les tests
 * @returns {true|false|'unknown'} true = vivant, false = mort, 'unknown' = ne pas quitter
 */
export function checkWrapperAlive({
    pidFilePath,
    expectedPid,
    readFileSync = fs.readFileSync,
    readProc = (pid) => fs.readFileSync(`/proc/${pid}/stat`, 'utf8'),
}) {
    // Desktop/CI : pas de wrapper → on ne quitte jamais a cause de ce test.
    if (!expectedPid) return 'unknown';

    let raw;
    try {
        raw = readFileSync(pidFilePath, 'utf8');
    } catch (e) {
        return false; // pidfile absent : wrapper disparu
    }

    const pid = Number(String(raw).trim());
    const expected = Number(expectedPid);
    if (!Number.isInteger(pid) || pid <= 0) return 'unknown';
    // Un PID different = un wrapper PLUS RECENT a pris le relais (v4.0.62) :
    // surtout ne pas quitter l'app dans ce cas.
    if (pid !== expected) return 'unknown';

    let stat;
    try {
        stat = readProc(pid);
    } catch (e) {
        return false;
    }
    // /proc/<pid>/stat = "pid (comm) state ..." : l'etat est apres le dernier ')'.
    const close = stat.lastIndexOf(')');
    const state = close >= 0 ? stat.slice(close + 2, close + 3) : '';
    if (state === '' || state === 'Z' || state === 'X') return false;
    return true;
}
