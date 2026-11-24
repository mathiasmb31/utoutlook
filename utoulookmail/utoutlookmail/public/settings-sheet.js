// app-actions.js — feuille « Paramètres » injectée dans la page mail.
// Regroupe les actions qui n'ont rien à faire dans la barre basse :
// rendu, diagnostics, première installation, quitter.
(() => {
    if (window.__utoutlookSettingsLoaded) return;
    window.__utoutlookSettingsLoaded = true;

    const tr = (key, fallback) =>
        (window.__utoutlookI18n && window.__utoutlookI18n[key]) || fallback;
    const ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#E95420" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="3"/>' +
        '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>' +
        '</svg>'
    );

    window.__utoutlookSettingsIcon = ICON;

    // Toast interne — remplace window.alert (boîte natives = rendu « web »).
    const toast = (message) => {
        if (!message) return;
        document.getElementById('__utSettingsToast')?.remove();
        const box = document.createElement('div');
        box.id = '__utSettingsToast';
        box.setAttribute('role', 'status');
        const overlap = Math.max(0, window.innerHeight - ((window.visualViewport?.height || window.innerHeight) + (window.visualViewport?.offsetTop || 0)));
        box.style.cssText = 'position:fixed;left:50%;bottom:' + (96 + overlap) + 'px;transform:translateX(-50%);' +
            'max-width:calc(100vw - 32px);padding:11px 16px;border-radius:12px;' +
            'background:rgba(15,15,26,.95);color:#fff;border:1px solid #E95420;' +
            'font:14px/1.25 sans-serif;text-align:center;z-index:2147483647;' +
            'box-shadow:0 4px 14px rgba(0,0,0,.5);';
        box.textContent = message;
        (document.body || document.documentElement).appendChild(box);
        setTimeout(() => box.remove(), 3600);
    };
    window.__utoutlookToast = toast;

    let panel = null;
    let armedReset = false;
    let armTimer = null;

    const row = (label, onClick, extraStyle = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = 'display:block;width:100%;padding:12px 14px;margin:6px 0;border-radius:10px;' +
            'border:1px solid rgba(233,84,32,.5);background:rgba(15,15,26,.85);' +
            'color:#fff;font:15px/1.2 sans-serif;text-align:left;cursor:pointer;' + extraStyle;
        b.addEventListener('click', onClick);
        return b;
    };

    const section = (title) => {
        const h = document.createElement('div');
        h.textContent = title;
        h.style.cssText = 'margin:16px 0 6px;color:#E95420;font:600 13px/1 sans-serif;text-transform:uppercase;letter-spacing:.04em;';
        return h;
    };

    const close = () => { if (panel) panel.style.display = 'none'; };

    // v4.4.6: la selection doit changer AU MOMENT DU CLIC — le mode reel ne
    // s'applique qu'au prochain lancement, mais le choix persiste, donc on
    // doit montrer immédiatement celui qui est enregistre.
    const markActive = (mode) => {
        if (!panel) return;
        panel.querySelectorAll('button[data-mode]').forEach((b) => {
            const active = b.dataset.mode === mode;
            b.style.borderColor = active ? '#E95420' : 'rgba(233,84,32,.35)';
            b.style.background = active ? 'rgba(233,84,32,.22)' : 'rgba(15,15,26,.85)';
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    };

    const build = () => {
        panel = document.createElement('div');
        panel.id = 'utoutlook-settings';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none;' +
            'align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);';

        const card = document.createElement('div');
        card.style.cssText = 'width:100%;max-width:560px;max-height:80vh;overflow-y:auto;' +
            'background:#0f0f1a;border-radius:18px 18px 0 0;padding:18px 18px 28px;' +
            'border-top:2px solid #E95420;color:#fff;font-family:sans-serif;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
        const title = document.createElement('strong');
        title.textContent = tr('settingsTitle', 'Settings');
        title.style.cssText = 'font-size:19px;color:#fff;';
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = tr('commonClose', 'Close');
        x.style.cssText = 'padding:8px 12px;border-radius:10px;border:1px solid #E95420;' +
            'background:transparent;color:#E95420;font:14px sans-serif;';
        x.addEventListener('click', close);
        header.appendChild(title);
        header.appendChild(x);
        card.appendChild(header);

        card.appendChild(section(tr('settingsDisplay', 'Display')));
        for (const [mode, key, fallback] of [
            ['auto', 'settingsRenderAuto', 'Automatic'],
            ['software', 'settingsRenderSoftware', 'Software'],
            ['hardware', 'settingsRenderHardware', 'Hardware'],
        ]) {
            const b = row(tr(key, fallback), async () => {
                try {
                    await window.electronAPI.setRenderMode(mode);
                    markActive(mode);
                    toast(tr('relaunchNotice', 'Please relaunch UToutlook Mail'));
                } catch (e) { toast(String(e.message || e)); }
            });
            b.dataset.mode = mode;
            card.appendChild(b);
        }

        card.appendChild(section(tr('actionDiagnostics', 'Diagnostics')));
        card.appendChild(row(tr('actionDiagnostics', 'Diagnostics'), async () => {
            try {
                const out = await window.electronAPI.getDiagnostics();
                toast(tr('diagnosticsSaved', 'Report saved to: {path}').replace('{path}', out || ''));
            } catch (e) { toast(String(e.message || e)); }
        }));

        card.appendChild(section(tr('actionFirstInstall', 'First install')));
        const reset = row(tr('actionFirstInstall', 'First install'), async () => {
            if (!armedReset) {
                armedReset = true;
                const confirmText = tr('actionFirstInstallConfirm', 'Wipe everything?');
                reset.textContent = confirmText;
                reset.style.background = '#E95420';
                toast(confirmText);
                armTimer = setTimeout(() => {
                    armedReset = false;
                    reset.textContent = tr('actionFirstInstall', 'First install');
                    reset.style.background = 'rgba(15,15,26,.85)';
                }, 3000);
                return;
            }
            clearTimeout(armTimer);
            armedReset = false;
            if (!window.electronAPI || typeof window.electronAPI.firstInstall !== 'function') {
                toast(tr('commonUnavailable', 'Action unavailable'));
                return;
            }
            try { await window.electronAPI.firstInstall(); } catch (e) { toast(String(e.message || e)); }
        }, 'border-color:#E95420;');
        card.appendChild(reset);

        card.appendChild(row(tr('commonQuit', 'Quit'), () => {
            close();
            try { window.electronAPI.quitApp(); } catch (_) {}
        }));

        panel.appendChild(card);
        panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
        (document.body || document.documentElement).appendChild(panel);
    };

    window.__utoutlookOpenSettings = async () => {
        if (!panel) build();
        // Fermer le clavier avant d'ouvrir la feuille, sinon elle passe dessous.
        try {
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } catch (_) {}
        const overlap = Math.max(0, window.innerHeight - ((window.visualViewport?.height || window.innerHeight) + (window.visualViewport?.offsetTop || 0)));
        panel.style.bottom = overlap + 'px';
        panel.style.display = 'flex';
        try {
            markActive(await window.electronAPI.getRenderMode());
        } catch (_) { /* mode inconnu : on laisse l'etat neutre */ }
    };
})();
