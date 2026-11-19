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
    // v4.1.3: deux boutons supplémentaires dans la barre de la liste :
    //   - UBTOUCH_ID : logo Ubuntu Touch ROND, purement décoratif (aucune action).
    //   - FIRST_ID   : « Première installation » — wipe complet + notif + relance.
    const UBTOUCH_ID = 'utoutlook-ubtouch-badge';
    const FIRST_ID = 'utoutlook-first-install-btn';
    // SVG Ubuntu Touch officiel (cercle orange UBports) en data-URI — pas de
    // fichier aggiuntif, fonctionne sous AppArmor et dans le preload isolé.
    const UBTOUCH_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<circle cx="32" cy="32" r="32" fill="#E95420"/>' +
        '<circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-width="2"/>' +
        '<circle cx="32" cy="32" r="5" fill="#fff"/>' +
        '</svg>'
    );
    // Outlook mail : outlook.live.com/mail, outlook.office.com/mail,
    // outlook.office365.com/mail, outlook.cloud.microsoft/mail, outlook.com/mail
    const MAIL_URL = /^https?:\/\/([^/]+\.)?outlook\.(live|office|office365)\.com\/mail|^https?:\/\/([^/]+\.)?outlook\.cloud\.microsoft\/mail|^https?:\/\/outlook\.com\/mail/i;

    const lastTrigger = {reload: 0, quit: 0, first: 0};

    // v4.1.3: style COMMUN aux 4 boutons — même taille, bords légèrement
    // arrondis (on garde le rendu d'origine des boutons Recharger/Quitter :
    // mêmes couleurs, même padding, même police ; seul le radius est unifié).
    const BTN_STYLE =
        'padding:10px 22px;border-radius:14px;font:15px sans-serif;cursor:pointer;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.5);';
    const BTN_RELOAD_STYLE = BTN_STYLE +
        'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;';
    const BTN_QUIT_STYLE = BTN_STYLE +
        'background:#E95420;color:#fff;border:1px solid #E95420;';
    // Bouton First install : même gabarit que Recharger (fond sombre, texte orange)
    const BTN_FIRST_STYLE = BTN_STYLE +
        'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;min-width:150px;';
    // Badge UBtouch : même hauteur que les autres, carré (logo rond centré),
    // purement décoratif — pas de curseur pointer, pas de tabindex.
    const BADGE_STYLE =
        'width:43px;height:43px;padding:0;border-radius:14px;cursor:default;' +
        'background:rgba(15,15,26,0.92);border:1px solid #E95420;' +
        'display:flex;align-items:center;justify-content:center;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.5);';

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
        if (kind === 'first') {
            // v4.1.3: wipe complet (cookies + réglages) + notification + relance,
            // côté principal via le handler IPC 'first-install' (déjà robuste).
            // Feedback immédiat dans la page en attendant la relance.
            const btn = document.getElementById(FIRST_ID);
            if (btn) {
                btn.disabled = true;
                setLabel(btn, tr('actionFirstInstallNotify', 'Data cleared — restarting…'));
            }
            try {
                if (window.electronAPI && typeof window.electronAPI.firstInstall === 'function') {
                    window.electronAPI.firstInstall();
                    return;
                }
            } catch (e) { console.warn('[utoutlook] firstInstall IPC failed:', e); }
            // Repli sans preload : effacement page + reload (le handler principal
            // n'est pas joignable, on ne peut pas garantir le wipe des réglages).
            try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
            try { location.reload(); } catch (_) {}
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
            // v4.1.0 (revue renderer #5): ne PAS figer overflow/height sur
            // le conteneur scrollable — ça supprimait le défilement interne
            // et envoyait la fin de liste sous la barre d'actions.
            a.style.setProperty('height', 'auto', 'important');
            a.style.setProperty('min-height', h + 'px', 'important');
            a.style.removeProperty('overflow');
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
            reload.style.cssText = BTN_RELOAD_STYLE;
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
            quit.style.cssText = BTN_QUIT_STYLE;
            quit.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation(); fire('quit');
            });
            bar.appendChild(quit);
        }

        // v4.1.3: badge UBtouch — décoratif, aucune action, inséré avant les
        // autres boutons (logo à gauche, puis Première installation).
        let ubtouch = document.getElementById(UBTOUCH_ID);
        if (!ubtouch) {
            ubtouch = document.createElement('div');
            ubtouch.id = UBTOUCH_ID;
            ubtouch.setAttribute('aria-hidden', 'true');
            ubtouch.style.cssText = BADGE_STYLE;
            const img = document.createElement('img');
            img.src = UBTOUCH_SVG;
            img.alt = '';
            img.width = 28; img.height = 28;
            img.style.cssText = 'display:block;width:28px;height:28px;';
            ubtouch.appendChild(img);
            bar.insertBefore(ubtouch, reload);
        }

        // v4.1.3: bouton « Première installation » — double-tap 3 s pour
        // confirmer (même modèle que le bouton de la page de login), puis
        // appel IPC firstInstall côté principal (wipe + notif + relance).
        let first = document.getElementById(FIRST_ID);
        if (!first) {
            first = document.createElement('button');
            first.id = FIRST_ID;
            first.type = 'button';
            first.style.cssText = BTN_FIRST_STYLE;
            let armed = false, armTimer = null;
            first.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!armed) {
                    armed = true;
                    const orig = first.textContent;
                    first.textContent = tr('actionFirstInstallConfirm', 'Wipe everything?');
                    first.style.background = '#E95420';
                    first.style.color = '#fff';
                    armTimer = setTimeout(() => {
                        armed = false;
                        first.textContent = orig;
                        first.style.background = 'rgba(15,15,26,0.92)';
                        first.style.color = '#E95420';
                    }, 3000);
                    return;
                }
                clearTimeout(armTimer);
                armed = false;
                fire('first');
            });
            bar.insertBefore(first, quit);
        }

        setLabel(reload, tr('reloadMessages', 'Reload messages'));
        setLabel(quit, tr('quitApp', 'Quit'));
        setLabel(first, tr('actionFirstInstall', 'First install'));
        // v4.1.0 (revue renderer #4): la barre doit rester visible SURTOUT
        // quand la liste est cassée (0×0) — c'est le cas à secourir. On ne
        // masque que le bouton Recharger pendant le chargement initial.
        bar.style.display = onMailPage() ? 'flex' : 'none';
        reload.style.display = listReady() ? '' : 'none';
        unhideList(); // v4.0.98: garder la liste visible après les re-render SPA
        syncNavState(); // v4.0.118: mémoriser un masquage automatique (paysage)
    };

    // Filet de sécurité : attraper les clics en capture, avant le SPA Outlook.
    if (!window.__utoutlookAppActionsCapture) {
        window.__utoutlookAppActionsCapture = true;
        window.addEventListener('click', (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            if (t.closest('#' + RELOAD_ID)) {
                e.preventDefault(); e.stopPropagation(); fire('reload');
            } else if (t.closest('#' + FIRST_ID)) {
                // v4.1.3: le bouton gère son propre double-tap (confirmation) —
                // en capture on laisse l'événement atteindre le listener du bouton.
                return;
            } else if (t.closest('#' + QUIT_ID)) {
                e.preventDefault(); e.stopPropagation(); fire('quit');
            }
        }, true);
    }

    // v4.0.114: préserver le choix de l'utilisateur concernant le volet de
    // navigation à travers les rechargements de page (rotation, watchdog).
    // Outlook remet le menu visible à chaque reload ; on mémorise son état
    // dans localStorage et on le réapplique dès le chargement suivant.
    const NAV_KEY = 'utoutlook-nav-pref'; // v4.0.118: nouvelle clé (l'ancienne
    // 'utoutlook-nav-hidden' gardait des valeurs "0" périmées des versions
    // précédentes → le menu était réouvert en permanence).
    // Règle : PAR DÉFAUT masqué ; seul un clic explicite sur le bouton du
    // volet peut passer à 'open'.
    const applyNavState = () => {
        let pref = null;
        try { pref = localStorage.getItem(NAV_KEY); } catch { /* ignore */ }
        // v4.0.120: le CSS masque le volet PAR DÉFAUT ; on ajoute seulement
        // la classe « show » si l'utilisateur l'a explicitement ouvert.
        document.documentElement.classList.toggle('utoutlook-show-nav', pref === 'open');
    };

    // v4.0.115: mémoriser l'état DU MOMENT OÙ IL EST MASQUÉ, quelle que soit
    // l'origine du masquage (clic utilisateur OU layout responsive d'Outlook
    // en paysage). Deux relevés consécutifs identiques évitent d'enregistrer
    // un état transitoire pendant un re-render SPA.
    let lastNavHidden = null;
    let navStableCount = 0;
    const storeNavState = (hidden) => {
        try { localStorage.setItem(NAV_KEY, hidden ? 'hidden' : 'open'); } catch { /* ignore */ }
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
        // v4.0.119: Outlook rejoue parfois un clic PROGRAMMATIQUE sur le bouton
        // du volet au chargement pour restaurer son état -> isTrusted=false.
        // Seul un vrai tap utilisateur (isTrusted=true) peut ouvrir le menu.
        const armedAt = Date.now();
        document.addEventListener('click', (e) => {
            if (!e.isTrusted) return;
            if (Date.now() - armedAt < 2500) return; // restauration au chargement
            const b = e.target && e.target.closest &&
                e.target.closest('button[aria-label], [role="button"][aria-label]');
            const lbl = (b && b.getAttribute('aria-label')) || '';
            // v4.0.118: ne pas matcher le simple mot « menu » — la barre
            // d'outils Outlook a des boutons « Menu » qui rouvraient le volet.
            if (!/volet de navigation|navigation pane|masquer le volet|afficher le volet|hide navigation|show navigation/i.test(lbl)) return;
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
        // v4.1.0 (revue #10): un seul listener de volet, même après réinjection.
        if (!window.__utoutlookNavWatch) {
            window.__utoutlookNavWatch = true;
            watchNavToggle();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }
    window.__utoutlookReloadBtn = true;
    window.__utoutlookQuitBtn = true;
})();
