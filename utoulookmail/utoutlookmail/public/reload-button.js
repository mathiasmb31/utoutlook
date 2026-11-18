// reload-button.js — Bouton « Recharger les messages » en bas de la liste (v4.0.95)
// Injecté par mail-window-controller (injectReloadButton) dans la page Outlook.
// Le bouton est fixe en bas au centre de l'écran : visible dès qu'on est sur une
// page mail Outlook (même quand la liste virtualisée est rendue 0x0 après un pivot).
// Au clic : IPC « reload-messages » vers le process principal (qui tente un
// repaint puis recharge la page), avec location.reload() en secours si le preload
// n'est pas disponible.
(() => {
    const BTN_ID = 'utoutlook-reload-btn';
    // Page mail Outlook : outlook.live.com/mail, outlook.office.com/mail,
    // outlook.office365.com/mail, outlook.cloud.microsoft/mail, outlook.com/mail
    const MAIL_URL = /^https?:\/\/([^/]+\.)?outlook\.(live|office|office365)\.com\/mail|^https?:\/\/([^/]+\.)?outlook\.cloud\.microsoft\/mail|^https?:\/\/outlook\.com\/mail/i;

    let lastTrigger = 0;

    const label = () =>
        (window.__utoutlookI18n && window.__utoutlookI18n.reloadMessages) || 'Reload messages';

    const onMailPage = () => MAIL_URL.test(location.href);

    const trigger = () => {
        // Évite un double déclenchement quand le clic est attrapé à la fois par
        // le listener capture (document) et par le bouton lui-même.
        const now = Date.now();
        if (now - lastTrigger < 800) return;
        lastTrigger = now;
        try {
            if (window.electronAPI && typeof window.electronAPI.reloadMessages === 'function') {
                window.electronAPI.reloadMessages();
                return;
            }
            // Compatibilité asar plus ancien : l'API « reload » existe depuis
            // longtemps et recharge la page (handler IPC déjà câblé).
            if (window.electronAPI && typeof window.electronAPI.reload === 'function') {
                window.electronAPI.reload();
                return;
            }
        } catch { /* ignore — fallback ci-dessous */ }
        location.reload();
    };

    const ensure = () => {
        if (!document.body) return;
        let btn = document.getElementById(BTN_ID);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = BTN_ID;
            btn.type = 'button';
            btn.style.cssText =
                'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
                'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;' +
                'padding:10px 22px;border-radius:24px;font:15px sans-serif;' +
                'z-index:2147483647;box-shadow:0 2px 10px rgba(0,0,0,.5);cursor:pointer;' +
                'pointer-events:auto;';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                trigger();
            });
            document.body.appendChild(btn);
        }
        const text = label();
        if (btn.textContent !== text) btn.textContent = text;
        if (btn.getAttribute('aria-label') !== text) btn.setAttribute('aria-label', text);
        // Visible sur toutes les vues mail Outlook (liste, lecture, recherche).
        btn.style.display = onMailPage() ? 'block' : 'none';
    };

    // Filet de sécurité : le SPA Outlook peut intercepter/stopper les clics dans
    // la phase de bouillonnement avant notre listener. On attrape donc le clic
    // en phase de capture, au niveau de window (avant document et avant Outlook).
    if (!window.__utoutlookReloadBtnCapture) {
        window.__utoutlookReloadBtnCapture = true;
        window.addEventListener('click', (e) => {
            const t = e.target;
            if (t && t.closest && t.closest('#' + BTN_ID)) {
                e.preventDefault();
                e.stopPropagation();
                trigger();
            }
        }, true);
    }

    const start = () => {
        ensure();
        // Le SPA Outlook peut retirer les noeuds inconnus : on se réajoute si
        // le bouton disparaît (observation peu coûteuse : enfants directs du body).
        if (!window.__utoutlookReloadBtnObs && document.body) {
            window.__utoutlookReloadBtnObs = new MutationObserver(() => ensure());
            window.__utoutlookReloadBtnObs.observe(document.body, {childList: true});
        }
        // La visibilité dépend de la vue courante (navigation SPA) : re-vérifiée
        // périodiquement, le MutationObserver seul ne couvre pas tous les cas.
        if (!window.__utoutlookReloadBtnTimer) {
            window.__utoutlookReloadBtnTimer = setInterval(ensure, 3000);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }
    window.__utoutlookReloadBtn = true;
})();
