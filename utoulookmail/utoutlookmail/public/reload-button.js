// app-actions.js — Barre d'actions flottante en bas de l'écran (v4.0.95)
// Injectée par mail-window-controller (injectReloadButton) dans la page Outlook.
// Deux boutons, au même endroit dans les deux orientations :
//   - « Recharger les messages » : visible sur les pages mail (secours liste 0x0).
//   - « Quitter » : TOUJOURS visible, vrai quit propre (flag exitclient) pour
//     que le wrapper command.sh s'arrête aussi — sans gesture de swipe.
// Clic en phase capture (le SPA Outlook peut stopper la propagation), avec
// replis si le preload n'est pas disponible.
(() => {
    const BAR_ID = 'utoutlook-app-actions';
    const RELOAD_ID = 'utoutlook-reload-btn';
    const QUIT_ID = 'utoutlook-quit-btn';
    // Outlook mail : outlook.live.com/mail, outlook.office.com/mail,
    // outlook.office365.com/mail, outlook.cloud.microsoft/mail, outlook.com/mail
    const MAIL_URL = /^https?:\/\/([^/]+\.)?outlook\.(live|office|office365)\.com\/mail|^https?:\/\/([^/]+\.)?outlook\.cloud\.microsoft\/mail|^https?:\/\/outlook\.com\/mail/i;

    const lastTrigger = {reload: 0, quit: 0};

    const tr = (key, fallback) =>
        (window.__utoutlookI18n && window.__utoutlookI18n[key]) || fallback;
    const onMailPage = () => MAIL_URL.test(location.href);

    // v4.0.103: les boutons n'apparaissent que quand la LISTE DES MESSAGES est
    // réellement chargée et visible — pas seulement sur une URL /mail (page
    // de login, splash Outlook, chargement en cours ou liste 0x0 excluent).
    const listReady = () => {
        const ml = document.querySelector('[data-app-section="MessageList"]');
        if (!ml || !ml.offsetParent) return false;
        if (ml.getBoundingClientRect().height < 100) return false;
        const rows = ml.querySelectorAll('[role="option"], [role="listitem"], [class*="listItem"]');
        return Array.from(rows).some((r) => r.getBoundingClientRect().height > 0);
    };

    const fire = (kind) => {
        const now = Date.now();
        if (now - lastTrigger[kind] < 800) return; // anti-double (capture + bouton)
        lastTrigger[kind] = now;
        if (kind === 'reload') {
            // Feedback IMMÉDIAT dans la page : même si l'IPC ne part pas,
            // l'utilisateur voit que le clic a été pris en compte.
            const btn = document.getElementById(RELOAD_ID);
            if (btn) {
                setLabel(btn, tr('reloading', 'Reloading…'));
                btn.disabled = true;
            }
            try {
                // API « reload » historique (offline.html) : chemin le plus
                // éprouvé — reloadWindow() → webContents.reload(), sans
                // dépendre du handler « reload-messages » plus récent.
                if (window.electronAPI && typeof window.electronAPI.reload === 'function') {
                    window.electronAPI.reload();
                } else if (window.electronAPI && typeof window.electronAPI.reloadMessages === 'function') {
                    window.electronAPI.reloadMessages();
                } else {
                    location.reload();
                }
            } catch { location.reload(); }
            // Filet de sécurité : si aucun IPC ne recharge effectivement la
            // page, on force un reload complet côté renderer. Le timer meurt
            // avec le contexte JS dès que le reload a lieu → pas de double.
            setTimeout(() => { location.reload(); }, 2000);
            return;
        }
        // Quit : le process principal doit écrire exitclient puis app.quit() —
        // c'est ce flag qui fait aussi sortir le wrapper command.sh.
        try {
            if (window.electronAPI && typeof window.electronAPI.quitApp === 'function') {
                window.electronAPI.quitApp();
                return;
            }
        } catch { /* fallback ci-dessous */ }
        // Sans preload, fermer la fenêtre déclenche le handler 'close' d'Electron
        // qui écrit lui-même exitclient (sauf si hideOnClose l'intercepte).
        try { window.close(); } catch { /* rien de plus possible */ }
    };

    const setLabel = (btn, text) => {
        if (btn.textContent !== text) btn.textContent = text;
        if (btn.getAttribute('aria-label') !== text) btn.setAttribute('aria-label', text);
    };

    // v4.0.98: Outlook ré-applique display:none / visibility:hidden sur les
    // conteneurs INTERNES de la liste après ses re-render (typique en paysage).
    // On force chaque ancêtre concerné jusqu'à MessageList, avec !important.
    const unhideList = () => {
        const ml = document.querySelector('[data-app-section="MessageList"]');
        const lb = ml && ml.querySelector('[role="listbox"]');
        if (!lb) return;
        // v4.0.100: hauteur PX explicite (un height:100% reste à 0 si le parent
        // est à 0) + opacity/overflow forcés sur toute la chaîne interne.
        const h = Math.max(200, Math.round(ml.getBoundingClientRect().height) - 10);
        let a = lb;
        // v4.0.101: exclure MessageList — figer son height en px pendant un
        // état transitoire de rotation l'empêcherait de se redimensionner.
        while (a && a !== ml && a !== document.body) {
            a.style.setProperty('display', 'flex', 'important');
            a.style.setProperty('visibility', 'visible', 'important');
            a.style.setProperty('opacity', '1', 'important');
            a.style.setProperty('height', h + 'px', 'important');
            a.style.setProperty('min-height', h + 'px', 'important');
            a.style.setProperty('max-height', 'none', 'important');
            a.style.setProperty('overflow', 'visible', 'important');
            a = a.parentElement;
        }
        // v4.0.104: réautoriser les taps sur les lignes (Outlook met
        // pointer-events:none sur les options → clic perdu pour le conteneur).
        const rows = ml.querySelectorAll('[role="option"], [role="listitem"], [class*="listItem"]');
        for (const row of rows) {
            row.style.setProperty('pointer-events', 'auto', 'important');
            for (const child of row.querySelectorAll('*')) {
                child.style.setProperty('pointer-events', 'auto', 'important');
            }
        }
    };

    const ensure = () => {
        if (!document.body) return;
        let bar = document.getElementById(BAR_ID);
        if (!bar) {
            bar = document.createElement('div');
            bar.id = BAR_ID;
            bar.style.cssText =
                'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:10px;z-index:2147483647;pointer-events:auto;';
            document.body.appendChild(bar);
        }

        let reload = document.getElementById(RELOAD_ID);
        if (!reload) {
            reload = document.createElement('button');
            reload.id = RELOAD_ID;
            reload.type = 'button';
            reload.style.cssText =
                'padding:10px 22px;border-radius:24px;font:15px sans-serif;cursor:pointer;' +
                'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;' +
                'box-shadow:0 2px 10px rgba(0,0,0,.5);';
            reload.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); fire('reload');
            });
            bar.appendChild(reload);
        }

        let quit = document.getElementById(QUIT_ID);
        if (!quit) {
            quit = document.createElement('button');
            quit.id = QUIT_ID;
            quit.type = 'button';
            quit.style.cssText =
                'padding:10px 22px;border-radius:24px;font:15px sans-serif;cursor:pointer;' +
                'background:#E95420;color:#fff;border:1px solid #E95420;' +
                'box-shadow:0 2px 10px rgba(0,0,0,.5);';
            quit.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); fire('quit');
            });
            bar.appendChild(quit);
        }

        setLabel(reload, tr('reloadMessages', 'Reload messages'));
        setLabel(quit, tr('quitApp', 'Quit'));
        // v4.0.103: barre entière masquée tant que la liste n'est pas chargée.
        bar.style.display = onMailPage() && listReady() ? 'flex' : 'none';
        unhideList(); // v4.0.98: garder la liste visible après les re-render SPA
    };

    // Filet de sécurité : attraper les clics en capture, avant le SPA Outlook.
    if (!window.__utoutlookAppActionsCapture) {
        window.__utoutlookAppActionsCapture = true;
        window.addEventListener('click', (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            if (t.closest('#' + RELOAD_ID)) {
                e.preventDefault(); e.stopPropagation(); fire('reload');
            } else if (t.closest('#' + QUIT_ID)) {
                e.preventDefault(); e.stopPropagation(); fire('quit');
            }
        }, true);
    }

    // v4.0.114: préserver le choix de l'utilisateur concernant le volet de
    // navigation à travers les rechargements de page (rotation, watchdog).
    // Outlook remet le menu visible à chaque reload ; on mémorise son état
    // dans localStorage et on le réapplique dès le chargement suivant.
    const NAV_KEY = 'utoutlook-nav-hidden';

    const applyNavState = () => {
        let hidden = false;
        try { hidden = localStorage.getItem(NAV_KEY) === '1'; } catch { /* ignore */ }
        document.documentElement.classList.toggle('utoutlook-hide-nav', hidden);
    };

    // v4.0.115: mémoriser l'état DU MOMENT OÙ IL EST MASQUÉ, quelle que soit
    // l'origine du masquage (clic utilisateur OU layout responsive d'Outlook
    // en paysage). Deux relevés consécutifs identiques évitent d'enregistrer
    // un état transitoire pendant un re-render SPA.
    let lastNavHidden = null;
    let navStableCount = 0;
    const storeNavState = (hidden) => {
        try { localStorage.setItem(NAV_KEY, hidden ? '1' : '0'); } catch { /* ignore */ }
    };
    const syncNavState = () => {
        const nav = document.querySelector('[data-app-section="NavigationPane"]');
        const hidden = !nav || !nav.offsetParent;
        if (hidden === lastNavHidden) {
            navStableCount += 1;
            // v4.0.115: ne mémoriser QUE le masquage. Un re-render SPA ou un
            // reload peut ré-afficher le volet tout seul — on ne doit jamais
            // enregistrer cet état « ouvert » automatiquement : seul un clic
            // manuel (voir watchNavToggle) peut le réouvrir durablement.
            if (hidden && navStableCount >= 2) storeNavState(true);
        } else {
            lastNavHidden = hidden;
            navStableCount = 1;
        }
    };

    const watchNavToggle = () => {
        document.addEventListener('click', (e) => {
            const b = e.target && e.target.closest &&
                e.target.closest('button[aria-label], [role="button"][aria-label]');
            const lbl = (b && b.getAttribute('aria-label')) || '';
            if (!/volet de navigation|navigation pane|menu/i.test(lbl)) return;
            // Laisser Outlook appliquer le toggle avant de lire l'état.
            setTimeout(() => {
                const nav = document.querySelector('[data-app-section="NavigationPane"]');
                const hidden = !nav || !nav.offsetParent;
                lastNavHidden = hidden;
                navStableCount = 2;
                storeNavState(hidden);
            }, 300);
        }, true);
    };

    const start = () => {
        applyNavState(); // v4.0.114: réappliquer avant tout rendu
        ensure();
        // Outlook peut retirer nos noeuds : on se réajoute si la barre disparaît.
        if (!window.__utoutlookAppActionsObs && document.body) {
            window.__utoutlookAppActionsObs = new MutationObserver(() => ensure());
            window.__utoutlookAppActionsObs.observe(document.body, {childList: true});
        }
        // La visibilité de « Recharger » dépend de la vue courante (SPA).
        if (!window.__utoutlookAppActionsTimer) {
            window.__utoutlookAppActionsTimer = setInterval(ensure, 3000);
        }
        watchNavToggle(); // v4.0.114: mémoriser les taps sur le bouton du volet
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }
    window.__utoutlookReloadBtn = true;
    window.__utoutlookQuitBtn = true;
})();
