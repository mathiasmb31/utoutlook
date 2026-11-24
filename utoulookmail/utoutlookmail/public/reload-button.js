// app-actions.js — Barre d'actions flottante en bas de l'écran (v4.0.95)
// Injectée par mail-window-controller (injectReloadButton) dans la page Outlook.
// v4.4.5: actions de lecture uniquement — Recharger, Joindre, Parametres.
// Les reglages, diagnostics, la reinitialisation et le quit sont dans la
// feuille Parametres injectee par settings-sheet.js.
// Clic en phase capture (le SPA Outlook peut stopper la propagation), avec
// replis si le preload n'est pas disponible.
(() => {
    const BAR_ID = 'utoutlook-app-actions';
    const RELOAD_ID = 'utoutlook-reload-btn';
    // v4.4.5: barre reduite aux actions de lecture — Recharger, Joindre,
    // et l'acces aux Parametres (reglages, diagnostics, reset, quit).
    const UBTOUCH_ID = 'utoutlook-ubtouch-badge';
    const ATTACH_ID = 'utoutlook-attach-btn';
    const SETTINGS_ID = 'utoutlook-settings-btn';
    const COMPOSE_SEL = '[class*="owaMailComposeEditorScrollContainer"], [id^="docking_InitVisiblePart_"]';
    const ATTACH_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#E95420" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21.4 11.6 12.3 20.7a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5"/>' +
        '</svg>'
    );
    // v4.1.5: VRAIE cocarde Ubuntu Touch officielle (fond orange #E95420 +
    // les 3 pastilles/arcs blancs), extraite du logo Wikimedia "Ubuntu touch
    // logo 2025 dark.svg" — pas une approximation. Cadrée sur le carré 73x73.
    // En data-URI : pas de fichier aggiuntif, marche sous AppArmor.
    const UBTOUCH_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 30 73 73">' +
        '<path fill="#E95420" d="M72.712 0H0v114.48h72.712z"/>' +
        '<path fill="#fff" d="M16.625 80.772a7.527 7.527 0 1 0 0-15.055 7.527 7.527 0 0 0 0 15.055m31.351-16.506a7.527 7.527 0 1 0 0-15.054 7.527 7.527 0 0 0 0 15.054M33.603 92.62a18.33 18.33 0 0 1-12.501-9.536 10.84 10.84 0 0 1-6.437.79c3.082 7.57 9.62 13.068 17.644 14.788 1.76.378 3.555.56 5.347.55a10.77 10.77 0 0 1-2.204-6.294 18 18 0 0 1-1.846-.3zm12.678 7.567a7.527 7.527 0 1 0 0-15.054 7.527 7.527 0 0 0 0 15.054m10.476-10.291a24.7 24.7 0 0 0 4.782-10.146A24.68 24.68 0 0 0 57.99 61a10.84 10.84 0 0 1-4.233 4.958 18.42 18.42 0 0 1 1.74 12.498 18.4 18.4 0 0 1-2.34 5.833 10.8 10.8 0 0 1 3.602 5.61zM16.044 62.45q.289-.016.573-.015 1.143 0 2.272.243c1.228.263 2.381.727 3.438 1.385a18.37 18.37 0 0 1 14.782-7.907q.048-.856.226-1.695a10.9 10.9 0 0 1 2.058-4.41c-9.468-.75-18.666 4.136-23.351 12.4z"/>' +
        '</svg>'
    );
    // Outlook mail : outlook.live.com/mail, outlook.office.com/mail,
    // outlook.office365.com/mail, outlook.cloud.microsoft/mail, outlook.com/mail
    const MAIL_URL = /^https?:\/\/([^/]+\.)?outlook\.(live|office|office365)\.com\/mail|^https?:\/\/([^/]+\.)?outlook\.cloud\.microsoft\/mail|^https?:\/\/outlook\.com\/mail/i;

    const lastTrigger = {reload: 0, quit: 0, first: 0};

    // v4.1.7: style COMMUN aux 4 boutons — même taille, bords arrondis.
    // Réduction du padding/police pour que les 4 tiennent dans 612 px logiques
    // sans couper les libellés (retour device 19/11 : « Reload messa » tronqué).
    // white-space:normal + line-height permet un retour à la ligne propre.
    const BTN_STYLE =
        'min-height:44px;padding:8px 12px;border-radius:12px;font:13px/1.15 sans-serif;cursor:pointer;' +
        'display:inline-flex;align-items:center;justify-content:center;gap:4px;' +
        'white-space:normal;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.5);';
    const BTN_RELOAD_STYLE = BTN_STYLE +
        'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;';

    // v4.1.8: badge UBtouch — align-self:stretch le force à prendre EXACTEMENT
    // la même hauteur que les boutons voisins (au lieu d'un height fixe qui
    // pouvait décaler). Carré, purement décoratif, pas de curseur pointer.
    const BADGE_STYLE =
        'width:34px;align-self:stretch;padding:3px;border-radius:12px;cursor:default;' +
        'background:#E95420;border:1px solid #E95420;' +
        'display:flex;align-items:center;justify-content:center;' +
        'box-sizing:border-box;box-shadow:0 2px 10px rgba(0,0,0,.5);';

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

    // v4.4.8: les inputs de fichier d'Outlook sont TOUJOURS caches (height 0).
    // Le marqueur fiable d'une composition est le conteneur de l'editeur.
    const composeFileInput = () => !!document.querySelector(COMPOSE_SEL);

    // v4.4.7: avec le clavier virtuel ouvert, un element fixed en bas du layout
    // viewport passe SOUS le clavier. On decale la barre de la hauteur reellement
    // masquee (visualViewport) — sans toucher au reste de la page.
    const keyboardOverlap = () => {
        const vv = window.visualViewport;
        if (!vv) return 0;
        return Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    };
    if (!window.__utoutlookBarViewportBound) {
        window.__utoutlookBarViewportBound = true;
        const repositionBar = () => {
            const bar = document.getElementById(BAR_ID);
            if (!bar || bar.style.top !== '') return; // deja en haut (composition active)
            bar.style.bottom = (12 + keyboardOverlap()) + 'px';
        };
        window.visualViewport?.addEventListener('resize', repositionBar);
        window.visualViewport?.addEventListener('scroll', repositionBar);
    }

    // v4.5.0: on reste EN HAUT tant que la composition existe, et non pas
    // seulement tant qu'un champ a le focus — sinon la barre redescendait au
    // moment precis ou on touchait « Joindre » et le bouton repassait sous le
    // clavier. Le clavier peut en effet recouvrir le bas sans que
    // visualViewport bouge sous Lomiri.
    if (!window.__utoutlookComposeBarPoll) {
        window.__utoutlookComposeBarPoll = true;
        let barTop = false;
        setInterval(() => {
            const bar = document.getElementById(BAR_ID);
            if (!bar) return;
            const composing = !!document.querySelector(COMPOSE_SEL);
            if (composing && !barTop) {
                bar.style.top = '12px';
                bar.style.bottom = 'auto';
                barTop = true;
            } else if (!composing && barTop) {
                bar.style.top = '';
                bar.style.bottom = (12 + keyboardOverlap()) + 'px';
                barTop = false;
            }
            // v4.5.4: des qu'une composition est ouverte, consommer une PJ
            // eventuellement livree par le Content Hub au lancement du click.
            if (composing && window.electronAPI &&
                typeof window.electronAPI.consumePendingAttachment === 'function') {
                window.electronAPI.consumePendingAttachment().catch(() => {});
            }
        }, 300);
    }

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
        // v4.4.5: 'first' et 'quit' ont ete deplaces dans la feuille Parametres.
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
                'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);' +
                'display:flex;flex-wrap:wrap;justify-content:center;gap:8px;' +
                'max-width:calc(100vw - 24px);z-index:2147483647;pointer-events:auto;';
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

        // v4.4: joindre un fichier depuis ubuntu touch (Content Hub). Le
        // transfert est fait cote main ; on n'attend que le resultat.
        let attachBtn = document.getElementById(ATTACH_ID);
        if (!attachBtn) {
            attachBtn = document.createElement('button');
            attachBtn.id = ATTACH_ID;
            attachBtn.type = 'button';
            const attachImg = document.createElement('img');
            attachImg.src = ATTACH_ICON;
            attachImg.alt = '';
            attachImg.width = 22;
            attachImg.height = 22;
            attachImg.style.cssText = 'display:inline-block;width:22px;height:22px;vertical-align:middle;';
            const attachLabel = document.createElement('span');
            attachBtn.appendChild(attachImg);
            attachBtn.appendChild(attachLabel);
            const label = tr('attachFile', 'Attach a file');
            attachLabel.textContent = label;
            attachBtn.title = label;
            attachBtn.setAttribute('aria-label', label);
            attachBtn.style.cssText = BTN_STYLE +
                'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;';
            attachBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!window.electronAPI ||
                    typeof window.electronAPI.attachFromHub !== 'function') return;
                attachBtn.disabled = true;
                try {
                    const added = await window.electronAPI.attachFromHub();
                    if (!added && window.__utoutlookToast) {
                        window.__utoutlookToast(tr('contentHubFailed', 'Could not attach the file'));
                    }
                } catch (_) {
                    if (window.__utoutlookToast) {
                        window.__utoutlookToast(tr('contentHubFailed', 'Could not attach the file'));
                    }
                } finally {
                    attachBtn.disabled = false;
                }
            });
            bar.appendChild(attachBtn);
        }
        const attachEl = document.getElementById(ATTACH_ID);
        if (attachEl) attachEl.style.display = composeFileInput() ? '' : 'none';
        if (!window.__utoutlookAttachPoll) {
            window.__utoutlookAttachPoll = setInterval(() => {
                const b = document.getElementById(ATTACH_ID);
                if (b) b.style.display = composeFileInput() ? '' : 'none';
            }, 1000);
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
            img.style.cssText = 'display:block;width:100%;height:100%;border-radius:9px;object-fit:contain;';
            ubtouch.appendChild(img);
            bar.insertBefore(ubtouch, reload);
        }

        // v4.4.5: acces aux reglages — icone SVG, libelle i18n.
        let settingsBtn = document.getElementById(SETTINGS_ID);
        if (!settingsBtn) {
            settingsBtn = document.createElement('button');
            settingsBtn.id = SETTINGS_ID;
            settingsBtn.type = 'button';
            const icon = document.createElement('img');
            icon.src = window.__utoutlookSettingsIcon || '';
            icon.alt = '';
            icon.width = 22;
            icon.height = 22;
            icon.style.cssText = 'display:inline-block;width:22px;height:22px;vertical-align:middle;margin-right:4px;';
            settingsBtn.appendChild(icon);
            const sLabel = document.createElement('span');
            settingsBtn.appendChild(sLabel);
            settingsBtn.style.cssText = BTN_STYLE +
                'background:rgba(15,15,26,0.92);color:#E95420;border:1px solid #E95420;' +
                'min-width:44px;';
            const sText = tr('settingsTitle', 'Settings');
            sLabel.textContent = sText;
            settingsBtn.title = sText;
            settingsBtn.setAttribute('aria-label', sText);
            settingsBtn.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                if (typeof window.__utoutlookOpenSettings === 'function') {
                    window.__utoutlookOpenSettings();
                }
            });
            bar.appendChild(settingsBtn);
        }

        setLabel(reload, tr('reloadMessages', 'Reload messages'));
        // v4.1.0 (revue renderer #4): la barre doit rester visible SURTOUT
        // quand la liste est cassée (0×0) — c'est le cas à secourir. On ne
        // masque que le bouton Recharger pendant le chargement initial.
        bar.style.display = onMailPage() ? 'flex' : 'none';
        // v4.3.8: plus d'effet glass (blur sur toutes les lignes) — il faisait
        // bloquer le renderer en mode logiciel et declenchait des relances.
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
                // en capture on laisse l'événement atteindre le listener du bouton.
                return;
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
