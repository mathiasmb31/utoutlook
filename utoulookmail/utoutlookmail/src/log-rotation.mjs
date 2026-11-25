import fs from 'node:fs';

// v4.3.7: borne de crash.log. Le wrapper.log, lui, ne doit PAS etre tronque :
// utils/common.sh utoutlook_resolve_render_mode() utilise ses numeros de ligne
// pour detecter un crash GPU recent (v4.0.127/128).
export const MAX_CRASH_LOG_BYTES = 1024 * 1024; // 1 Mo

/**
 * Vide un fichier de log s'il depasse la taille maximale.
 * @param {string} filePath
 * @param {number} maxBytes
 * @param {Object} fsApi - injectable pour les tests (statSync/writeFileSync)
 * @returns {boolean} true si le fichier a ete vide
 */
export function capLogIfLarge(filePath, maxBytes = MAX_CRASH_LOG_BYTES, fsApi = fs) {
    try {
        const st = fsApi.statSync(filePath);
        if (st && st.size > maxBytes) {
            fsApi.writeFileSync(filePath, '', {flag: 'w'});
            return true;
        }
    } catch (e) {
        // Fichier absent ou illisible : rien a borner.
    }
    return false;
}
