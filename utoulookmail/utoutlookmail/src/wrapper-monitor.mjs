import fs from 'node:fs';

// v4.3.7: supervision inverse wrapper <- Electron.
// Le wrapper surveille deja le heartbeat Electron toutes les 3 s, mais rien
// ne detectait la mort du wrapper (SIGKILL Lomiri) : Electron restait vivant
// avec un heartbeat actif = "app vivante mais invisible" + notifications
// orphelines. Ce module est PUR (aucune dependance Electron) et testable.
//
// v4.3.8: durcissement apres les fermetures aleatoires du 21/11. Sur le click
// 4.3.7, Electron quittait alors que le wrapper etait ENCORE VIVANT (le log
// "clean quit announced by Electron — wrapper exits now" prouve que le wrapper
// tournait apres l'avertissement). Cause : toute erreur de lecture (pidfile ou
// /proc/<pid>/stat) etait considerée comme "wrapper mort". Desormais on ne
// declare la mort QUE sur une preuve positive : signal 0 -> ESRCH, ou etat
// /proc explicitement Z/X. Toute lecture impossible = 'unknown' = on ne quitte
// pas. Cela supprime les faux positifs sans perdre la detection reelle.

function defaultProbe(pid) {
    try {
        process.kill(pid, 0); // 0 = test d'existence, aucun signal envoye
        return 'alive';
    } catch (e) {
        if (e && e.code === 'ESRCH') return 'dead';
        // EPERM (uid different) ou toute autre erreur : on ne conclut pas.
        return 'unknown';
    }
}

/**
 * Verifie que le wrapper qui a lance cette instance est toujours vivant.
 * @param {Object} options
 * @param {string} options.pidFilePath - chemin du fichier wrapper.pid
 * @param {string|number} options.expectedPid - PID transmis par UTOUTLOOK_WRAPPER_PID
 * @param {Function} [options.readFileSync] - injectable pour les tests
 * @param {Function} [options.readProc] - injectable pour les tests
 * @param {Function} [options.probe] - injectable pour les tests ('alive'|'dead'|'unknown')
 * @returns {true|false|'unknown'} true = vivant, false = mort, 'unknown' = ne pas quitter
 */
export function checkWrapperAlive({
    pidFilePath,
    expectedPid,
    readFileSync = fs.readFileSync,
    readProc = (pid) => fs.readFileSync(`/proc/${pid}/stat`, 'utf8'),
    probe = defaultProbe,
}) {
    // Desktop/CI : pas de wrapper → on ne quitte jamais a cause de ce test.
    if (!expectedPid) return 'unknown';

    let raw;
    try {
        raw = readFileSync(pidFilePath, 'utf8');
    } catch (e) {
        // v4.3.8: pidfile illisible n'est PAS une preuve de mort.
        return 'unknown';
    }

    const pid = Number(String(raw).trim());
    const expected = Number(expectedPid);
    if (!Number.isInteger(pid) || pid <= 0) return 'unknown';
    // Un PID different = un wrapper PLUS RECENT a pris le relais (v4.0.62) :
    // surtout ne pas quitter l'app dans ce cas.
    if (pid !== expected) return 'unknown';

    // v4.3.8: signal 0 d'abord — c'est la source la plus fiable sous AppArmor.
    const state = probe(pid);
    if (state === 'alive') return true;
    if (state === 'dead') return false;

    // Repli /proc : info seulement, une erreur de lecture ne prouve rien.
    let stat;
    try {
        stat = readProc(pid);
    } catch (e) {
        return 'unknown';
    }
    // /proc/<pid>/stat = "pid (comm) state ..." : l'etat est apres le dernier ')'.
    const close = stat.lastIndexOf(')');
    const procState = close >= 0 ? stat.slice(close + 2, close + 3) : '';
    if (procState === '' || procState === 'Z' || procState === 'X') {
        return procState === '' ? 'unknown' : false;
    }
    return true;
}
