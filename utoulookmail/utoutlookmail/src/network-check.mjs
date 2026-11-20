// v4.3.7: decision pure pour l'ecran hors-ligne au demarrage.
// En mode avion, did-fail-load ne se declenche pas toujours (page en cache) :
// on exige 2 echocs consecutifs d'un vrai test serveur avant d'afficher
// l'ecran, pour ne pas piéger un reseau qui met quelques secondes a monter.
export const STARTUP_NETWORK_CHECKS = 2;

export function shouldShowOfflineScreen(consecutiveFailures, required = STARTUP_NETWORK_CHECKS) {
    return Number(consecutiveFailures) >= required;
}
