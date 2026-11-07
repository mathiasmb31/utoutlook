// ============================================================
// gestures.js — Touch gestures for Outlook web on Ubuntu Touch
// Injected into the Outlook web page via executeJavaScript()
// ============================================================

(function () {
    'use strict';

    // Prevent double-injection
    if (window.__utoutlookGesturesLoaded) return;
    window.__utoutlookGesturesLoaded = true;

    // --- v3.3.60: structural password-field fix (réappliqué, corrigé) ---
    // Chromium/Blink sets the HAS_BEEN_PASSWORD flag on the window the first time
    // a password field takes focus — after that the OSK stops delivering text
    // ANYWHERE (verified: version 2.1.1 on OpenStore works because it ships an
    // older Chromium without this flag; Electron 44 / Chromium 142+ has it).
    // Chromium also refuses IME commits in input[type=password]. Fix: convert
    // every password field IN PLACE to type=text (same node → React keeps its
    // listeners and value tracker, focus/insertText are preserved) and mask it
    // with CSS (-webkit-text-security:disc → dots). The prototype patches below
    // run BEFORE any setAttribute/focus can set 'password', so HAS_BEEN_PASSWORD
    // is never set and IME commits always go through.
    const PW_MASK_ATTR = 'data-pwmask';
    const ensureMaskStyle = () => {
        if (document.getElementById('__pwMaskStyle')) return;
        const st = document.createElement('style');
        st.id = '__pwMaskStyle';
        st.textContent = 'input[' + PW_MASK_ATTR + ']{-webkit-text-security:disc !important;}';
        (document.head || document.documentElement).appendChild(st);
    };
    const demaskPw = (el) => {
        if (!(el instanceof HTMLInputElement)) return false;
        if (el.type === 'password' || (el.getAttribute('type') || '').toLowerCase() === 'password') {
            try { el.setAttribute(PW_MASK_ATTR, '1'); } catch (_) {}
            try { el.type = 'text'; } catch (_) {}
            return true;
        }
        return false;
    };
    const scanPwFields = () => {
        ensureMaskStyle();
        document.querySelectorAll('input[type=password]').forEach(demaskPw);
    };
    // v3.3.76: NE PLUS patcher Element.prototype.setAttribute/setAttributeNS —
    // intercepter CHAQUE setAttribute ajoute des frames de pile à chaque binding
    // Knockout de la page de login Microsoft → « Maximum call stack size exceeded »
    // en boucle sur la vue « Trying to sign you in ». La conversion des champs
    // password est couverte par le setter `type` ci-dessous + scanPwFields
    // (MutationObserver + interval), qui suffit pour les champs créés dynamiquement.
    // v3.3.80: le getter DOIT utiliser le descripteur ORIGINAL capturé AVANT le
    // defineProperty — sinon il se rappelle lui-même → récursion infinie sur
    // CHAQUE lecture de input.type (Knockout lit .type dans ses bindings →
    // « Maximum call stack size exceeded » en boucle sur la page de login).
    const origTypeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type');
    const origTypeSetter = origTypeDesc.set;
    const origTypeGetter = origTypeDesc.get;
    Object.defineProperty(HTMLInputElement.prototype, 'type', {
        set(v) {
            if (String(v).toLowerCase() === 'password') {
                try { this.setAttribute(PW_MASK_ATTR, '1'); } catch (_) {}
                return origTypeSetter.call(this, 'text');
            }
            return origTypeSetter.call(this, v);
        },
        get() {
            return origTypeGetter.call(this);
        },
        configurable: true,
    });
    scanPwFields();
    new MutationObserver(() => scanPwFields())
        .observe(document.documentElement, {childList: true, subtree: true});
    setInterval(scanPwFields, 2000);

    // --- v3.3.50/v3.3.53: badge logo + « Made for Ubtouch » centré au milieu de la page de login Microsoft ---
    const LOGIN_HOSTS_RE = /(^|\.)login\.(microsoftonline|live)\.com$/i;
    const LOGO_DATA_URI = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgdmVyc2lvbj0iMS4xIgogICB3aWR0aD0iODAwIgogICBoZWlnaHQ9IjgwMCIKICAgdmlld0JveD0iMCAwIDgwMCA4MDAiCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPgoKICA8ZGVmcz4KICAgIDwhLS0gQ2lyY3VsYXIgdGV4dCBwYXRoIGZvciByb3RhdGluZyB0ZXh0IC0tPgogICAgPHBhdGggaWQ9ImNpcmNsZS10ZXh0LXBhdGgiIGQ9IgogICAgICBNIDQwMCw0MDAKICAgICAgbSAtMzEwLDAKICAgICAgYSAzMTAsMzEwIDAgMSwxIDYyMCwwCiAgICAgIGEgMzEwLDMxMCAwIDEsMSAtNjIwLDAKICAgICIgZmlsbD0ibm9uZSIvPgoKICAgIDwhLS0gUmV1c2FibGUgdGV4dCBvbiBwYXRoIC0tPgogICAgPHRleHQgaWQ9ImNpcmNsZS10ZXh0IiBmb250LWZhbWlseT0iVWJ1bnR1LCBDYW50YXJlbGwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjgiIGZvbnQtd2VpZ2h0PSI2MDAiIGxldHRlci1zcGFjaW5nPSI2IiBmaWxsPSIjZmZmZmZmIiBvcGFjaXR5PSIwLjg1Ij4KICAgICAgPHRleHRQYXRoIGhyZWY9IiNjaXJjbGUtdGV4dC1wYXRoIiBzdGFydE9mZnNldD0iMCUiPkhVTUFOIE1BREUgJiN4MjAyMjsgVklCRSBWRVJJRklFRCAmI3gyMDIyOyBIVU1BTiBNQURFICYjeDIwMjI7IFZJQkUgVkVSSUZJRUQgJiN4MjAyMjsmIzE2MDs8L3RleHRQYXRoPgogICAgPC90ZXh0PgoKICAgIDwhLS0gTWFzY290dGUgaGVhZCBjbGlwcGVkIHRvIGEgY2lyY2xlIC0tPgogICAgPGNsaXBQYXRoIGlkPSJoZWFkLWNsaXAiPgogICAgICA8Y2lyY2xlIGN4PSI0MDAiIGN5PSIyODUiIHI9IjEwNSIvPgogICAgPC9jbGlwUGF0aD4KICA8L2RlZnM+CgogIDwhLS0gQmFja2dyb3VuZCBjaXJjbGUg4oCUIFVidW50dSBUb3VjaCBvcmFuZ2UgLS0+CiAgPGNpcmNsZSBjeD0iNDAwIiBjeT0iNDAwIiByPSIzOTAiIGZpbGw9IiNFOTU0MjAiLz4KCiAgPCEtLSBJbm5lciBzdWJ0bGUgcmluZyAtLT4KICA8Y2lyY2xlIGN4PSI0MDAiIGN5PSI0MDAiIHI9IjM2MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utb3BhY2l0eT0iMC4xNSIgc3Ryb2tlLXdpZHRoPSIyIi8+CgogIDwhLS0gUm90YXRpbmcgdGV4dCBncm91cCAtLT4KICA8Zz4KICAgIDx1c2UgaHJlZj0iI2NpcmNsZS10ZXh0Ii8+CiAgICA8YW5pbWF0ZVRyYW5zZm9ybQogICAgICBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iCiAgICAgIGF0dHJpYnV0ZVR5cGU9IlhNTCIKICAgICAgdHlwZT0icm90YXRlIgogICAgICBmcm9tPSIwIDQwMCA0MDAiCiAgICAgIHRvPSIzNjAgNDAwIDQwMCIKICAgICAgZHVyPSIyMHMiCiAgICAgIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIgogICAgLz4KICA8L2c+CgogIDwhLS0gQ2VudGVyOiBtYWlsIGVudmVsb3BlIHdpdGggdGhlIFVCVG91Y2ggbWFzY290IGhlYWQgcG9wcGluZyBvdXQgLS0+CiAgPGc+CiAgICA8IS0tIEVudmVsb3BlIGJvZHkgKHdoaXRlKSwgc2xpZ2h0bHkgbG93ZXIgc28gdGhlIGhlYWQgb3ZlcmxhcHMgaXRzIHRvcCBlZGdlIC0tPgogICAgPHJlY3QgeD0iMjkwIiB5PSI0MDAiIHdpZHRoPSIyMjAiIGhlaWdodD0iMTUwIiByeD0iMTIiIGZpbGw9IiNmZmZmZmYiLz4KICAgIDwhLS0gRW52ZWxvcGUgZmxhcCAodG9wIHRyaWFuZ2xlKSAtLT4KICAgIDxwYXRoIGQ9Ik0gMjkwLDQxMiBMIDQwMCw0OTUgTCA1MTAsNDEyIiBmaWxsPSJub25lIiBzdHJva2U9IiNFOTU0MjAiIHN0cm9rZS13aWR0aD0iOCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8IS0tIEVudmVsb3BlIGJvdHRvbSBmb2xkIGxpbmVzIC0tPgogICAgPHBhdGggZD0iTSAyOTAsNTQwIEwgMzc1LDQ3MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRTk1NDIwIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iMC41NSIvPgogICAgPHBhdGggZD0iTSA1MTAsNTQwIEwgNDI1LDQ3MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRTk1NDIwIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iMC41NSIvPgoKICAgIDwhLS0gTWFzY290IGhlYWQgcG9wcGluZyBvdXQgb2YgdGhlIGVudmVsb3BlIChjaXJjbGUtY2xpcHBlZCBpbWFnZSkgLS0+CiAgICA8Zz4KICAgICAgPGNpcmNsZSBjeD0iNDAwIiBjeT0iMjg1IiByPSIxMTIiIGZpbGw9IiNmZmZmZmYiLz4KICAgICAgPGltYWdlIHhsaW5rOmhyZWY9Im1hc2NvdHRlLTUxMi5wbmciIGhyZWY9Im1hc2NvdHRlLTUxMi5wbmciIHg9IjI5NSIgeT0iMTgwIiB3aWR0aD0iMjEwIiBoZWlnaHQ9IjIxMCIgY2xpcC1wYXRoPSJ1cmwoI2hlYWQtY2xpcCkiIHByZXNlcnZlQXNwZWN0UmF0aW89InhNaWRZTWlkIHNsaWNlIi8+CiAgICAgIDxjaXJjbGUgY3g9IjQwMCIgY3k9IjI4NSIgcj0iMTEyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNiIvPgogICAgPC9nPgogIDwvZz4KPC9zdmc+Cg==';
    const injectLoginBadge = () => {
        if (!LOGIN_HOSTS_RE.test(location.hostname)) return;
        if (document.getElementById('utoutlook-login-badge')) return;
        const label = (window.__utoutlookI18n && window.__utoutlookI18n.loginMadeFor) || 'Made for Ubtouch';
        const d = document.createElement('div');
        d.id = 'utoutlook-login-badge';
        d.style.cssText = 'position:fixed;right:8px;top:8px;display:flex;flex-direction:column;align-items:center;gap:4px;z-index:2147483647;pointer-events:none;';
        const img = document.createElement('img');
        img.alt = '';
        img.style.cssText = 'width:56px;height:56px;';
        img.src = LOGO_DATA_URI;
        const cap = document.createElement('div');
        cap.textContent = label;
        cap.style.cssText = 'font:600 13px/1.2 system-ui,sans-serif;color:#E95420;background:rgba(255,255,255,.85);padding:2px 10px;border-radius:10px;';
        d.appendChild(img);
        d.appendChild(cap);
        (document.body || document.documentElement).appendChild(d);
    };
    injectLoginBadge();
    new MutationObserver(() => injectLoginBadge())
        .observe(document.documentElement, {childList: true, subtree: true});

    // --- v3.3.57: pré-remplir le dernier login connu + bouton ⌫ (le clavier Wayland
    // n'envoie pas la touche backspace, seules les frappes passent en text-input) ---
    const prefillLogin = () => {
        if (!LOGIN_HOSTS_RE.test(location.hostname)) return;
        const p = document.querySelector('input[name=loginfmt]');
        const known = window.__utoutlookI18n && window.__utoutlookI18n.knownLogin;
        if (p && known && !p.value) {
            p.value = known;
            p.dispatchEvent(new Event('input', {bubbles: true}));
        }
        // v4.0.2: mémorise l'email saisi pour que le login_hint (tuile du compte)
        // soit rejoué à CHAQUE chargement de la page de login, pas une fois sur deux
        if (p && p.value && /@(outlook|hotmail|live|msn)\./i.test(p.value)) {
            try { localStorage.setItem('__utoutlook_known_login', p.value); } catch (_) {}
        }
    };
    const isField = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    let lastField = null; // v4.0.1: champ ciblé même si le focus a brièvement bougé
    const ensureBsButton = () => {
        let b = document.getElementById('utoutlook-bs');
        const ae = document.activeElement;
        const inField = isField(ae) || isField(lastField);
        if (inField && !b) {
            b = document.createElement('button');
            b.id = 'utoutlook-bs';
            b.textContent = '\u232b';
            b.setAttribute('aria-label', 'Backspace');
            b.style.cssText = 'position:fixed;right:14px;bottom:14px;width:56px;height:56px;border-radius:50%;border:none;background:#E95420;color:#fff;font-size:26px;z-index:2147483647;cursor:pointer;';
            // v4.0.1: empêcher le bouton de prendre le focus au clic — sinon
            // activeElement devient le bouton, le handler ne retrouve plus le champ
            // (bouton « ne marche pas ») et focusout fait disparaître le bouton.
            b.addEventListener('mousedown', e => e.preventDefault());
            b.addEventListener('click', () => {
                const a = isField(document.activeElement) ? document.activeElement : lastField;
                if (!a) return;
                a.focus();
                if (!document.execCommand('delete')) {
                    const st = a.selectionStart, en = a.selectionEnd;
                    if (st !== en) a.setRangeText('', st, en, 'end');
                    else if (st > 0) a.setRangeText('', st - 1, st, 'end');
                    a.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'deleteContentBackward'}));
                }
            });
            (document.body || document.documentElement).appendChild(b);
        } else if (!inField && b) {
            b.remove();
        }
    };
    prefillLogin();
    ensureBsButton();
    document.addEventListener('focusin', e => { if (isField(e.target)) lastField = e.target; ensureBsButton(); }, true);
    document.addEventListener('focusout', () => setTimeout(ensureBsButton, 150), true);
    setInterval(function () { prefillLogin(); ensureBsButton(); }, 800);
    new MutationObserver(() => { prefillLogin(); }).observe(document.documentElement, {childList: true, subtree: true});

    // --- v3.3.63: bouton « Première installation » visible en bas à gauche de la page
    // de login (le bouton ⌫ est en bas à droite — aucun chevauchement, aucun contenu masqué).
    // Vide cookies + localStorage + sessionStorage + IndexedDB puis recharge la page,
    // pour repartir d'un état vierge quand une session Microsoft bloque (boucle 2FA, etc.). ---
    const ensureFirstInstallButton = () => {
        if (!LOGIN_HOSTS_RE.test(location.hostname)) return;
        if (document.getElementById('utoutlook-first-install')) return;
        const i18n = window.__utoutlookI18n || {};
        const b = document.createElement('button');
        b.id = 'utoutlook-first-install';
        b.textContent = i18n.firstInstall || 'First install';
        b.setAttribute('aria-label', b.textContent);
        b.style.cssText = 'position:fixed;left:14px;bottom:14px;padding:8px 14px;border-radius:20px;border:2px solid #E95420;background:rgba(255,255,255,.92);color:#E95420;font:600 13px/1 system-ui,sans-serif;z-index:2147483647;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);';
        // v3.3.66: window.confirm() is NOT implemented in Electron (always returns
        // false) — the native confirm dialog is shown by the main process via IPC.
        // Fallback without electronAPI: two-tap pattern (tap once to arm, tap again
        // within 3s to confirm).
        let armed = false, armTimer = null;
        b.addEventListener('click', async () => {
            if (window.electronAPI && typeof window.electronAPI.firstInstall === 'function') {
                await window.electronAPI.firstInstall(); // native dialog inside, wipes + reloads
                return;
            }
            if (!armed) {
                armed = true;
                const orig = b.textContent;
                b.textContent = (i18n.firstInstallConfirmAction || 'Wipe everything') + ' ?';
                b.style.background = '#E95420';
                b.style.color = '#fff';
                armTimer = setTimeout(() => {
                    armed = false;
                    b.textContent = orig;
                    b.style.background = 'rgba(255,255,255,.92)';
                    b.style.color = '#E95420';
                }, 3000);
                return;
            }
            clearTimeout(armTimer);
            armed = false;
            // Fallback: in-page clear, awaiting IndexedDB deletion BEFORE reload
            // (an immediate reload cancels the async deleteDatabase calls).
            try { localStorage.clear(); } catch (_) {}
            try { sessionStorage.clear(); } catch (_) {}
            try {
                document.cookie.split(';').forEach(c => {
                    const name = c.split('=')[0].trim();
                    if (name) {
                        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                        document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
                        let d = location.hostname;
                        while (d.indexOf('.') > 0) {
                            d = d.substring(d.indexOf('.') + 1);
                            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + d;
                        }
                    }
                });
            } catch (_) {}
            try {
                if (window.indexedDB && indexedDB.databases) {
                    const dbs = await indexedDB.databases();
                    await Promise.all(dbs.map(db => db.name
                        ? new Promise(res => { const r = indexedDB.deleteDatabase(db.name); r.onsuccess = r.onerror = r.onblocked = () => res(); })
                        : Promise.resolve()));
                }
            } catch (_) {}
            location.reload();
        });
        (document.body || document.documentElement).appendChild(b);
    };
    ensureFirstInstallButton();
    new MutationObserver(() => ensureFirstInstallButton())
        .observe(document.documentElement, {childList: true, subtree: true});

    // --- v3.3.42: masquer le bouton « Options de connexion » ---
    // Sur la page de saisie du mot de passe Microsoft, ce lien mène à la page
    // GitHub (bloquée en v3.3.41 car le clavier XIM n'y tape pas). On le cache.
    const SIGNIN_OPTIONS_RE = /options\s+de\s+connexion|autres\s+options\s+de\s+connexion|sign-?\s*in\s+options|other\s+sign-?\s*in\s+options/i;
    const HIDE_SIO = 'display:none!important;visibility:hidden!important;opacity:0!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;pointer-events:none!important;';
    const hideSignInOptions = (root) => {
        const base = (root && root.querySelectorAll) ? root : document;
        const testEl = (el) => {
            if (!el || el.hasAttribute('data-utoutlook-sio-hidden')) return;
            const id = (el.id || '') + ' ' + (el.getAttribute('data-automation-id') || '');
            const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
            if ((t.length > 0 && t.length < 120 && SIGNIN_OPTIONS_RE.test(t)) || /signinoption/i.test(id)) {
                el.style.cssText += HIDE_SIO;
                el.setAttribute('data-utoutlook-sio-hidden', 'true');
            }
        };
        if (base.matches) testEl(base);   // the added node itself is not returned by querySelectorAll
        base.querySelectorAll('a,button,[role=button],[tabindex]').forEach(testEl);
    };
    hideSignInOptions(document);
    new MutationObserver((muts) => {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (n.nodeType === Node.ELEMENT_NODE) hideSignInOptions(n);
            }
        }
    }).observe(document.documentElement, {childList: true, subtree: true});
    setInterval(() => hideSignInOptions(document), 3000);

    // --- Disable native overscroll/pull-to-refresh on the page ---
    // Outlook web shows an envelope icon when the user pulls down from the
    // top of the message list. Block it at the CSS level (inline style as a
    // fallback — main.css also sets this with !important via insertCSS).
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';

    // Ensure scroll containers don't bounce
    const scrollStyle = document.createElement('style');
    scrollStyle.textContent =
        'html, body { overscroll-behavior-y: none !important; }' +
        '[class*="messageList"], [class*="listView"], [role="list"], [role="grid"]' +
        ' { overscroll-behavior-y: contain !important; }';
    document.head.appendChild(scrollStyle);

    // ============================================================
    // MutationObserver — Cache dynamiquement les indicateurs de
    // chargement (enveloppe bleue) qui apparaissent après le
    // chargement initial (SPA Outlook). Le CSS statique ne suffit
    // pas car Outlook recrée les nœuds DOM à chaque navigation.
    // ============================================================
    const HIDE_STYLE = 'display:none!important;visibility:hidden!important;opacity:0!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;pointer-events:none!important;';

    // Sélecteurs pour détecter les indicateurs de chargement
    const LOADING_SELECTORS = [
        '[role="progressbar"]',
        '[aria-busy="true"]',
        '[aria-label*="loading" i]',
        '[aria-label*="chargement" i]',
        '[aria-label*="refresh" i]',
        '[aria-label*="actualis" i]',
        '[aria-label*="sync" i]',
        '[data-automation-id*="spinner" i]',
        '[data-automation-id*="loading" i]',
        '[data-automation-id*="progress" i]',
        '[data-automation-id*="refresh" i]',
        '[data-automation-id*="pull" i]',
        '[class*="pullToRefresh"]',
        '[class*="refreshIndicator"]',
        '[class*="refreshControl"]',
        '[class*="overscrollIndicator"]',
        '[class*="listLoading"]',
        '[class*="loadingMore"]',
        '[class*="loadMoreIndicator"]',
        '[class*="messageListSpinner"]',
        '[class*="loadingOverlay"]',
        '[class*="loadingBackdrop"]',
        '[class*="refreshOverlay"]',
        '[class*="skeleton"]',
        '[class*="Skeleton"]',
        '[class*="shimmer"]',
        '[class*="Shimmer"]',
        '[class*="ProgressRing"]',
        '[class*="progressRing"]',
        '[class*="Spinner"]',
        '[class*="spinner"]',
        '[class*="spin"]',
        '[class*="Spin"]',
        '[class*="fui-Spinner"]',
        '[class*="fui-ProgressIndicator"]',
        '[class*="fui-ProgressRing"]',
        '[class*="ms-Spinner"]',
        '[class*="ms-ProgressIndicator"]',
        '[class*="ProgressIndicator"]'
    ];

    // Containers de liste à surveiller
    const LIST_SELECTORS = '[role="list"], [role="grid"], [class*="messageList"], [class*="listView"], [class*="virtualizedList"]';

    function isInListContext(el) {
        // Vérifier si l'élément est dans un conteneur de liste
        return el.closest(LIST_SELECTORS) !== null;
    }

    function hideLoadingIndicators(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        for (const selector of LOADING_SELECTORS) {
            try {
                const elements = root.querySelectorAll(selector);
                elements.forEach(el => {
                    // Ne cacher que si dans un contexte de liste ou si c'est un overlay global
                    if (isInListContext(el) || selector.includes('Overlay') || selector.includes('Backdrop') || selector.includes('pullToRefresh') || selector.includes('refreshIndicator') || selector.includes('overscroll')) {
                        el.style.cssText += HIDE_STYLE;
                        el.setAttribute('data-utoutlook-hidden', 'true');
                    }
                });
                // Vérifier si le root lui-même correspond
                if (root.matches && root.matches(selector)) {
                    if (isInListContext(root) || selector.includes('Overlay') || selector.includes('Backdrop') || selector.includes('pullToRefresh')) {
                        root.style.cssText += HIDE_STYLE;
                        root.setAttribute('data-utoutlook-hidden', 'true');
                    }
                }
            } catch (e) { /* sélecteur invalide, ignorer */ }
        }
    }

    // Observer les mutations dans les conteneurs de liste
    const listObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Nouveaux nœuds ajoutés
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    hideLoadingIndicators(node);
                }
            }
            // Attributs modifiés (aria-busy, class, etc.)
            if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
                hideLoadingIndicators(mutation.target.parentElement || mutation.target);
            }
        }
    });

    function observeListContainer(container) {
        if (!container || container.hasAttribute('data-utoutlook-observed')) return;
        container.setAttribute('data-utoutlook-observed', 'true');
        listObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-busy', 'aria-label', 'style', 'data-automation-id'] });
        hideLoadingIndicators(container);
    }

    // Observer le body pour détecter les nouveaux conteneurs de liste
    const bodyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Nouveau conteneur de liste
                    if (node.matches && node.matches(LIST_SELECTORS)) {
                        observeListContainer(node);
                    }
                    // Chercher des conteneurs de liste dans le nouveau nœud
                    if (node.querySelectorAll) {
                        node.querySelectorAll(LIST_SELECTORS).forEach(observeListContainer);
                    }
                    // Cacher les indicateurs dans le nouveau nœud
                    hideLoadingIndicators(node);
                }
            }
        }
    });

    // Démarrer l'observation quand le DOM est prêt
    function startObserving() {
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        // Observer les conteneurs existants
        document.querySelectorAll(LIST_SELECTORS).forEach(observeListContainer);
        // Cacher les indicateurs existants
        hideLoadingIndicators(document.body);
        console.log('[gestures] Loading indicator observer started');
    }

    if (document.body) {
        startObserving();
    } else {
        document.addEventListener('DOMContentLoaded', startObserving);
    }

    // Réappliquer périodiquement (sécurité anti-régression SPA).
    // v3.3.24: ne scanner QUE les conteneurs de liste, pas tout document.body —
    // sur le gros DOM d'Outlook, ~35 querySelectorAll sur tout le body toutes les
    // 3s coûtaient cher en CPU sur téléphone.
    setInterval(() => {
        document.querySelectorAll(LIST_SELECTORS).forEach(container => {
            observeListContainer(container);
            hideLoadingIndicators(container);
        });
        updateEmptyState(); // v3.3.25
    }, 3000);

    // --- Swipe from left edge to go back (browser history) ---
    let touchStartX = 0;
    let touchStartY = 0;
    let trackingSwipe = false;

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            // Only track swipes starting from the left 50px edge
            trackingSwipe = touchStartX < 50;
        }
    }, {passive: true});

    document.addEventListener('touchend', function (e) {
        if (!trackingSwipe || e.changedTouches.length !== 1) return;
        trackingSwipe = false;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;
        // Swipe right > 100px and mostly horizontal
        if (diffX > 100 && Math.abs(diffY) < 80) {
            console.log('[gestures] Swipe right detected → history.back()');
            window.history.back();
        }
    }, {passive: true});

    // --- Pull-to-refresh (pull down from top) ---
    // Outlook web is a SPA: the message list scrolls inside an inner div,
    // NOT on window — window.scrollY is always 0. Testing window.scrollY
    // therefore made EVERY downward slide get preventDefault()'d (blue bar
    // shown, list frozen). Fix: track the real scrollable ancestor of the
    // touch target and only block when that container is at scrollTop <= 0.
    let pullStartY = 0;
    let isPulling = false;
    let pullContainer = null;
    let pullIndicator = null;

    function findScrollContainer(el) {
        let node = el;
        while (node && node !== document.documentElement && node !== document.body) {
            const style = window.getComputedStyle(node);
            if (/(auto|scroll|overlay)/.test(style.overflowY) &&
                node.scrollHeight > node.clientHeight + 1) {
                return node;
            }
            node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function createPullIndicator() {
        if (pullIndicator) return pullIndicator;
        pullIndicator = document.createElement('div');
        pullIndicator.style.cssText =
            'position:fixed;top:0;left:0;right:0;height:4px;' +
            'background:#0078d4;z-index:99999;transform:scaleX(0);' +
            'transform-origin:left;transition:transform:0.1s;pointer-events:none;';
        document.body.appendChild(pullIndicator);
        return pullIndicator;
    }

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        pullContainer = findScrollContainer(e.target);
        const atTop = pullContainer.scrollTop <= 0 && window.scrollY === 0;
        if (atTop) {
            pullStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, {passive: true});

    document.addEventListener('touchmove', function (e) {
        if (!isPulling || e.touches.length !== 1) return;
        // If the scroll container is no longer at the very top, the user is
        // scrolling the list — never block that gesture.
        if (pullContainer.scrollTop > 0 || window.scrollY > 0) {
            isPulling = false;
            if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
            return;
        }
        const diff = e.touches[0].clientY - pullStartY;
        if (diff > 0) {
            const progress = Math.min(diff / 120, 1);
            createPullIndicator().style.transform = `scaleX(${progress})`;
            // Only prevent default when truly pulling down from the top —
            // blocks both the browser pull-to-refresh AND Outlook web's
            // own envelope refresh indicator.
            e.preventDefault();
        } else {
            // v4.0.4: scrolling back up releases the pull — otherwise a
            // negative diff would leave isPulling=true and block the next
            // downward gesture.
            isPulling = false;
            if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
        }
    }, {passive: false});

    // v4.0.4: touchcancel (OSK opening, notification, palm rejection) must
    // release isPulling — without this, isPulling stays true forever and
    // every later touchmove from the top calls preventDefault → the
    // message list can no longer be scrolled at all.
    document.addEventListener('touchcancel', function () {
        isPulling = false;
        if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
    }, {passive: true});

    document.addEventListener('touchend', function () {
        if (!isPulling) return;
        isPulling = false;
        if (pullIndicator) {
            const currentScale = parseFloat(pullIndicator.style.transform.replace('scaleX(', '').replace(')', '')) || 0;
            if (currentScale > 0.7) {
                // NE PAS faire window.location.reload() — cela déclenche
                // le splash screen d'Outlook web (enveloppe bleue plein
                // écran qui tourne). La barre bleue est purement visuelle.
                console.log('[gestures] Pull-to-refresh detected (visual only, no reload)');
                pullIndicator.style.transform = 'scaleX(1)';
                setTimeout(() => {
                    if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
                }, 500);
            } else {
                pullIndicator.style.transform = 'scaleX(0)';
            }
        }
    }, {passive: true});

    // --- Double-tap to zoom on text ---
    let lastTapTime = 0;
    document.addEventListener('touchend', function (e) {
        const now = Date.now();
        if (now - lastTapTime < 300 && e.changedTouches.length === 1) {
            // Double tap — could toggle zoom on the tapped element
            const el = document.elementFromPoint(
                e.changedTouches[0].clientX,
                e.changedTouches[0].clientY
            );
            if (el && (el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'SPAN')) {
                console.log('[gestures] Double-tap detected on text element');
            }
        }
        lastTapTime = now;
    }, {passive: true});

    // ============================================================
    // v3.3.25: Empty state — show a friendly message when the message
    // list has no items (instead of a blank area).
    // ============================================================
    const EMPTY_ID = 'utoutlook-empty-state';
    function updateEmptyState() {
        const list = document.querySelector('[aria-label="Liste des messages"], [aria-label="Message list"], [data-app-section="MessageList"] [aria-label*="messages" i]');
        if (!list) return;
        const hasItems = list.querySelectorAll('div').length > 3; // header rows etc.
        let el = document.getElementById(EMPTY_ID);
        if (!hasItems && !el) {
            el = document.createElement('div');
            el.id = EMPTY_ID;
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                'height:40vh;color:#888;text-align:center;font-family:Ubuntu,sans-serif;pointer-events:none;';
            el.innerHTML = '<div style="font-size:48px;opacity:0.5">&#x1F4ED;</div>' +
                '<div style="font-size:1.2em;margin-top:12px;font-weight:600"></div>' +
                '<div style="font-size:0.95em;margin-top:6px;opacity:0.8"></div>';
            el.children[1].textContent = (window.__utoutlookI18n && window.__utoutlookI18n.emptyTitle) || 'No messages';
            el.children[2].textContent = (window.__utoutlookI18n && window.__utoutlookI18n.emptyBody) || 'This folder is empty.';
            list.appendChild(el);
        } else if (hasItems && el) {
            el.remove();
        }
    }

    // ============================================================
    // v3.3.25: Swipe actions on message list items —
    // swipe LEFT = delete, swipe RIGHT = mark as read/unread.
    // Best effort: clicks the matching toolbar button if present.
    // ============================================================
    let swipeStartX = 0, swipeStartY = 0, swipeItem = null;
    const LIST_ITEM_SEL = '[aria-label="Liste des messages"] > div, [aria-label="Message list"] > div';

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        const item = e.target.closest && e.target.closest(LIST_ITEM_SEL);
        if (item) {
            swipeItem = item;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
        }
    }, {passive: true});

    document.addEventListener('touchend', function (e) {
        if (!swipeItem || e.changedTouches.length !== 1) { swipeItem = null; return; }
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        const item = swipeItem;
        swipeItem = null;
        if (Math.abs(dx) < 100 || Math.abs(dy) > 60) return; // not a horizontal swipe
        const action = dx < 0 ? 'delete' : 'toggle-read';
        console.log('[gestures] Swipe ' + action + ' on message item');
        // Select the item first so the action toolbar appears
        item.click();
        setTimeout(() => {
            const patterns = action === 'delete'
                ? /supprimer|delete|corbeille|trash/i
                : /marquer comme lu|marquer comme non lu|mark as read|mark as unread/i;
            const btns = document.querySelectorAll('[role="toolbar"] button, [role="toolbar"] [role="button"], [data-app-section="CommandBar"] button');
            for (const b of btns) {
                const label = (b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '');
                if (patterns.test(label)) { b.click(); console.log('[gestures] Action triggered: ' + label.trim().substring(0, 40)); return; }
            }
            console.log('[gestures] No toolbar button found for swipe action ' + action + ' (DOM may have changed)');
        }, 400);
    }, {passive: true});

    console.log('[gestures] Touch gestures initialized');
})();
