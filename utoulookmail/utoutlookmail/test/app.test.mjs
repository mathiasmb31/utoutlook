import {test} from 'node:test';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Tests for config.mjs — path constants
// ============================================================

test('config: CONFIG_DIR is under the user home', async () => {
    const {CONFIG_DIR} = await import('../src/config.mjs');
    const home = process.env.HOME || '/home/phablet';
    assert.ok(CONFIG_DIR.startsWith(home + '/'));
    assert.ok(CONFIG_DIR.includes('utoutlook.mathias'));
});

test('config: SOCKET_PATH is inside CONFIG_DIR', async () => {
    const {CONFIG_DIR, SOCKET_PATH} = await import('../src/config.mjs');
    assert.ok(SOCKET_PATH.startsWith(CONFIG_DIR));
    assert.ok(SOCKET_PATH.endsWith('.sock'));
});

test('config: all IPC file paths are inside CONFIG_DIR', async () => {
    const config = await import('../src/config.mjs');
    const files = [
        config.HEARTBEAT_FILE,
        config.EXIT_CLIENT_FILE,
        config.KILLED_CLIENT_FILE,
        config.CLOSE_FLAG_FILE,
        config.INIT_FLAG_FILE,
    ];
    for (const f of files) {
        assert.ok(f.startsWith(config.CONFIG_DIR), `${f} should be inside CONFIG_DIR`);
    }
});

// ============================================================
// Tests for client-injector.mjs — path validation
// ============================================================

test('client-injector: rejects path traversal', async () => {
    const getClientFile = (await import('../src/controller/client-injector.mjs')).default;
    // Leading ../ are stripped, so ../../../etc/passwd becomes etc/passwd inside public dir
    // → "not a valid client file". A direct absolute path outside public → "Security".
    assert.throws(() => getClientFile('../../../etc/passwd'), /not a valid|Security/);
    assert.throws(() => getClientFile('/etc/passwd'), /not a valid|Security/);
});

test('client-injector: rejects empty input', async () => {
    const getClientFile = (await import('../src/controller/client-injector.mjs')).default;
    assert.throws(() => getClientFile(''), TypeError);
    assert.throws(() => getClientFile(null), TypeError);
});

test('client-injector: loads valid CSS file', async () => {
    const getClientFile = (await import('../src/controller/client-injector.mjs')).default;
    const css = getClientFile('main.css');
    assert.ok(typeof css === 'string');
    assert.ok(css.length > 0);
});

test('client-injector: caches results', async () => {
    const getClientFile = (await import('../src/controller/client-injector.mjs')).default;
    const css1 = getClientFile('main.css');
    const css2 = getClientFile('main.css');
    assert.strictEqual(css1, css2);
});

// ============================================================
// Tests for ipc-socket.mjs — command handling
// ============================================================

test('ipc-socket: handleCommand processes quit', async () => {
    // v4.1.0 (revue F5): vrai test via une connexion socket — l'ancien test
    // initialisait quitCalled=false sans jamais l'asserter (faux positif).
    const net = await import('node:net');
    const {startSocketServer, stopSocketServer} = await import('../src/ipc-socket.mjs');
    const {SOCKET_PATH} = await import('../src/config.mjs');
    let quitCalled = false;
    const server = startSocketServer({ onQuit: () => { quitCalled = true; } });
    try {
        const response = await new Promise((resolve, reject) => {
            const c = net.createConnection(SOCKET_PATH);
            let buf = '';
            const timer = setTimeout(() => { c.destroy(); reject(new Error('socket timeout')); }, 2000);
            c.on('connect', () => c.write(JSON.stringify({cmd: 'quit'}) + '\n'));
            c.on('data', (d) => {
                buf += d.toString();
                if (buf.includes('\n')) { clearTimeout(timer); c.end(); resolve(buf); }
            });
            c.on('error', (e) => { clearTimeout(timer); reject(e); });
        });
        assert.ok(response.includes('"ok":true'), 'quit command must be acknowledged');
        assert.ok(quitCalled, 'onQuit handler must actually be called (v4.1.0)');
        assert.ok(server);
    } finally {
        stopSocketServer();
    }
});

test('ipc-socket: hold command keeps the connection open then replies (v4.3.7)', async () => {
    // Long-poll du watchdog : la reponse doit etre DIFFEREE (pas "ok" immediat)
    // et porter held:true. C'est ce qui permet au wrapper de detecter un quit
    // par fermeture du socket, sans sleep ni polling (commit 8b8e647+).
    const net = await import('node:net');
    const {startSocketServer, stopSocketServer} = await import('../src/ipc-socket.mjs');
    const {SOCKET_PATH} = await import('../src/config.mjs');
    const server = startSocketServer({});
    try {
        const t0 = Date.now();
        const response = await new Promise((resolve, reject) => {
            const c = net.createConnection(SOCKET_PATH);
            let buf = '';
            const timer = setTimeout(() => { c.destroy(); reject(new Error('hold socket timeout')); }, 2000);
            c.on('connect', () => c.write(JSON.stringify({cmd: 'hold', ms: 120}) + '\n'));
            c.on('data', (d) => {
                buf += d.toString();
                if (buf.includes('\n')) { clearTimeout(timer); c.end(); resolve(buf); }
            });
            c.on('error', (e) => { clearTimeout(timer); reject(e); });
        });
        assert.ok(response.includes('"held":true'), 'hold must reply held:true (v4.3.7)');
        assert.ok(!response.includes('"pong"'), 'hold must not be answered like ping');
        assert.ok(Date.now() - t0 >= 90, 'hold must keep the connection open for the requested delay');
        assert.ok(server);
    } finally {
        stopSocketServer();
    }
});

test('ipc-socket: notifyQuitting releases long-poll clients immediately (v4.3.7)', async () => {
    const net = await import('node:net');
    const {startSocketServer, stopSocketServer, notifyQuitting} =
        await import('../src/ipc-socket.mjs');
    const {SOCKET_PATH} = await import('../src/config.mjs');
    const server = startSocketServer({});
    try {
        const t0 = Date.now();
        const response = await new Promise((resolve, reject) => {
            const c = net.createConnection(SOCKET_PATH);
            let buf = '';
            const timer = setTimeout(() => { c.destroy(); reject(new Error('notifyQuitting timeout')); }, 2000);
            c.on('connect', () => {
                // hold 10 s : si notifyQuitting ne libere pas le client, le test expire a 2 s.
                c.write(JSON.stringify({cmd: 'hold', ms: 10000}) + '\n');
                setTimeout(() => notifyQuitting(), 60);
            });
            c.on('data', (d) => {
                buf += d.toString();
                if (buf.includes('\n')) { clearTimeout(timer); c.end(); resolve(buf); }
            });
            c.on('error', (e) => { clearTimeout(timer); reject(e); });
        });
        assert.ok(response.includes('"quitting":true'), 'quit announcement must carry quitting:true');
        assert.ok(Date.now() - t0 < 1000, 'quit announcement must be immediate (not the 10 s hold)');
        assert.ok(server);
    } finally {
        stopSocketServer();
    }
});

// ============================================================
// v4.3.7 — relance apres fermeture : instance orpheline, pas de "au revoir"
// ============================================================

test('v4.3.7: a SIGKILLed wrapper is detected as dead (orphaned Electron)', async () => {
    const {checkWrapperAlive} = await import('../src/wrapper-monitor.mjs');
    const state = checkWrapperAlive({
        pidFilePath: 'wrapper.pid',
        expectedPid: '4242',
        readFileSync: () => '4242\n',                          // pidfile encore l'ancien wrapper
        readProc: () => { throw new Error('ENOENT'); },         // /proc illisible
        probe: () => 'dead',                                    // ESRCH = vraiment disparu
    });
    assert.strictEqual(state, false,
        'an orphaned Electron must be seen as wrapper-dead, not merely unknown');
});

test('v4.3.7: no goodbye when wrapper is gone; orphan closed before fresh launch', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const main = fs.readFileSync(path.join(here, '../src/main.mjs'), 'utf-8');
    const cmd = fs.readFileSync(path.join(here, '../../command.sh'), 'utf-8');

    assert.ok(main.includes('wrapperStillAlive'),
        'goodbye must be gated on wrapper liveness (no au revoir at next launch)');
    assert.ok(main.includes('if (process.env.WD && wrapperStillAlive)'),
        'goodbye must be skipped when the wrapper is already dead');
    assert.ok(main.includes('skipping goodbye notification'),
        'the skipped goodbye must be observable in wrapper.log');

    assert.ok(cmd.includes('PREV_WRAPPER_PID='),
        'previous wrapper PID must be captured before cleanup() overwrites the pidfile');
    assert.ok(cmd.includes('orphaned instance') && cmd.includes('closing it before fresh launch'),
        'orphaned Electron must be closed then relaunched, never reused with show');
    assert.ok(!cmd.includes('adopt'),
        'no adopt loop: an already-quitting Electron must not be told to stay');
});

// ============================================================
// Tests for settings defaults
// These require electron-store which needs the Electron runtime.
// Skip gracefully when running outside Electron (e.g. CI, plain node).
// ============================================================

async function canImportSettings() {
    try {
        await import('../src/settings.mjs');
        return true;
    } catch {
        return false;
    }
}

const settingsAvailable = await canImportSettings();

test('settings: default URL is Outlook', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    assert.strictEqual(settings.get('urlMainWindow'), 'https://outlook.office.com/mail');
});

test('settings: hideOnClose defaults to false (v4.4.4)', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    assert.strictEqual(settings.get('hideOnClose'), false);
});

test('settings: startMinimized forced to false at load (v4.0.10, stale pre-3.0 settings.json)', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    // v4.0.10: a settings.json persisted by v2.x could carry startMinimized=true,
    // leaving the app invisible after the splash (upgrade bug) — the module
    // forces it back to false at load time.
    assert.strictEqual(settings.get('startMinimized'), false);
});

test('settings: customBrowserPath defaults to undefined', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    const val = settings.get('customBrowserPath');
    assert.ok(val === undefined || val === null);
});

test('settings: darkMode defaults to auto', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    assert.strictEqual(settings.get('darkMode'), 'auto');
});

test('settings: darkMode accepts valid values', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    for (const mode of ['auto', 'on', 'off']) {
        settings.set('darkMode', mode);
        assert.strictEqual(settings.get('darkMode'), mode);
    }
    // Reset to default
    settings.set('darkMode', 'auto');
});

// ============================================================
// Tests for i18n.mjs — translations
// ============================================================

test('i18n: default language is fr', async () => {
    const {getLanguage, setLanguage} = await import('../src/i18n.mjs');
    setLanguage('fr');
    assert.strictEqual(getLanguage(), 'fr');
});

test('i18n: translates common keys', async () => {
    const {t, setLanguage} = await import('../src/i18n.mjs');
    setLanguage('fr');
    assert.strictEqual(t('tray.quit'), 'Quitter');
    assert.strictEqual(t('common.cancel'), 'Annuler');
    setLanguage('en');
    assert.strictEqual(t('tray.quit'), 'Quit');
    assert.strictEqual(t('common.cancel'), 'Cancel');
});

test('i18n: interpolates variables', async () => {
    const {t, setLanguage} = await import('../src/i18n.mjs');
    setLanguage('en');
    assert.strictEqual(t('notif.newMessages.body', {count: 5}), '5 unread message(s)');
    setLanguage('fr');
    assert.strictEqual(t('notif.newMessages.body', {count: 3}), '3 message(s) non lu(s)');
});

test('i18n: falls back to fr for unknown language', async () => {
    const {t, setLanguage, getLanguage} = await import('../src/i18n.mjs');
    setLanguage('xx');
    assert.strictEqual(getLanguage(), 'fr');
    assert.strictEqual(t('tray.quit'), 'Quitter');
});

test('i18n: returns key for missing translation', async () => {
    const {t, setLanguage} = await import('../src/i18n.mjs');
    setLanguage('en');
    assert.strictEqual(t('nonexistent.key'), 'nonexistent.key');
});

test('i18n: supports 10 languages', async () => {
    const {getAvailableLanguages} = await import('../src/i18n.mjs');
    const langs = getAvailableLanguages();
    assert.strictEqual(Object.keys(langs).length, 10);
    for (const l of ['fr','en','es','de','it','pt','zh','ar','ca','eu']) {
        assert.ok(langs[l], `language ${l} must be declared`);
    }
});

test('i18n: detectLanguage parses locale strings', async () => {
    const {detectLanguage} = await import('../src/i18n.mjs');
    assert.strictEqual(detectLanguage('fr_FR.UTF-8'), 'fr');
    assert.strictEqual(detectLanguage('en-US'), 'en');
    assert.strictEqual(detectLanguage('es_ES.UTF-8'), 'es');
    assert.strictEqual(detectLanguage('zh_CN.UTF-8'), 'zh');
    assert.strictEqual(detectLanguage('ar_SA.UTF-8'), 'ar');
    assert.strictEqual(detectLanguage('xx_XX'), 'fr'); // fallback
    assert.strictEqual(detectLanguage(''), 'fr'); // fallback
});

test('i18n: all languages have tray.quit translation', async () => {
    const {t, setLanguage, getAvailableLanguages} = await import('../src/i18n.mjs');
    for (const lang of Object.keys(getAvailableLanguages())) {
        setLanguage(lang);
        const translated = t('tray.quit');
        assert.ok(translated !== 'tray.quit', `Missing tray.quit for ${lang}`);
        assert.ok(translated.length > 0, `Empty tray.quit for ${lang}`);
    }
});

test('i18n: all languages have context menu translations', async () => {
    const {t, setLanguage, getAvailableLanguages} = await import('../src/i18n.mjs');
    const ctxKeys = ['ctx.undo', 'ctx.redo', 'ctx.cut', 'ctx.copy', 'ctx.paste', 'ctx.selectAll', 'ctx.openLink', 'ctx.copyLink', 'ctx.inspect'];
    for (const lang of Object.keys(getAvailableLanguages())) {
        setLanguage(lang);
        for (const key of ctxKeys) {
            const translated = t(key);
            assert.ok(translated !== key, `Missing ${key} for ${lang}`);
            assert.ok(translated.length > 0, `Empty ${key} for ${lang}`);
        }
    }
});

// ============================================================
// Tests for session persistence fixes (v3.2.2)
// ============================================================

test('observer: script sets __utoutlookObserverActive flag', async () => {
    const fs = await import('node:fs');
    const observerPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(observerPath, 'utf-8');
    assert.ok(content.includes('window.__utoutlookObserverActive'),
        'Observer should set __utoutlookObserverActive flag for health check');
});

test('observer: script has cleanup mechanism for re-injection', async () => {
    const fs = await import('node:fs');
    const observerPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(observerPath, 'utf-8');
    assert.ok(content.includes('window.__utoutlookObserverCleanup'),
        'Observer should expose __utoutlookObserverCleanup for re-injection');
});

test('observer: script uses exponential backoff for retries', async () => {
    const fs = await import('node:fs');
    const observerPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(observerPath, 'utf-8');
    assert.ok(content.includes('maxRetryDelayMs'),
        'Observer should have a max retry delay cap');
    assert.ok(content.includes('retryDelay * 2') || content.includes('retryDelay*2') ||
              content.includes('retryState.delay * 2'),
        'Observer should use exponential backoff (doubling delay)');
});

test('mail-window-controller: has cookie flush interval', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('startCookieFlush'),
        'Controller should start periodic cookie flush');
    assert.ok(content.includes('flushSessionCookies'),
        'Controller should have flushSessionCookies method');
    assert.ok(content.includes('cookies.flushStore'),
        'Controller should call cookies.flushStore()');
});

test('mail-window-controller: has observer health check', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('startObserverHealthCheck'),
        'Controller should start observer health check');
    assert.ok(content.includes('__utoutlookObserverActive'),
        'Controller should check __utoutlookObserverActive flag');
});

test('mail-window-controller: injects observer on did-stop-loading', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('did-stop-loading'),
        'Controller should re-inject observer on did-stop-loading event');
});

test('main: flushes session cookies on cleanupAndExit', async () => {
    const fs = await import('node:fs');
    const mainPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mainPath, 'utf-8');
    assert.ok(content.includes('flushStore'),
        'main.mjs should flush session cookies before exit');
    assert.ok(content.includes('cleanupAndExit'),
        'main.mjs should have cleanupAndExit method');
});

test('common.sh: uses SIGTERM before SIGKILL for graceful shutdown', async () => {
    const fs = await import('node:fs');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const content = fs.readFileSync(commonPath, 'utf-8');
    // SIGTERM should appear before SIGKILL (-9) in the kill function
    const termPos = content.indexOf('pkill" -TERM');
    const killPos = content.indexOf('pkill" -9 prospect-mail');
    assert.ok(termPos !== -1, 'common.sh should use SIGTERM (-TERM) for graceful shutdown');
    assert.ok(killPos !== -1, 'common.sh should still have SIGKILL (-9) as fallback');
    assert.ok(termPos < killPos, 'SIGTERM should be sent before SIGKILL');
});

// ============================================================
// Tests for startup notification fixes (v3.2.2)
// ============================================================

test('common.sh: utoutlook_notify has retry logic', async () => {
    const fs = await import('node:fs');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const content = fs.readFileSync(commonPath, 'utf-8');
    assert.ok(content.includes('max_attempts=3'), 'utoutlook_notify should retry 3 times');
    assert.ok(content.includes('utoutlook_notify()'), 'utoutlook_notify function should exist');
});

test('common.sh: has utoutlook_wait_notifications function', async () => {
    const fs = await import('node:fs');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const content = fs.readFileSync(commonPath, 'utf-8');
    assert.ok(content.includes('utoutlook_wait_notifications()'),
        'common.sh should have utoutlook_wait_notifications function');
});

test('command.sh: uses utoutlook_notify instead of direct notify calls', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');
    // Should use utoutlook_notify for all notifications
    assert.ok(content.includes('utoutlook_notify "$(utoutlook_t'),
        'command.sh should use utoutlook_notify for shell notifications');
    // Should NOT have direct notify calls (except in comments)
    const directCalls = content.match(/"\$\{WD\}"\/bin\/notify/g) || [];
    assert.strictEqual(directCalls.length, 0,
        'command.sh should not call notify binary directly');
});

test('command.sh: waits for notifications service (welcome now sent by Electron)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');
    assert.ok(content.includes('utoutlook_wait_notifications'),
        'command.sh should wait for notification service before launching Electron');
    // v4.2.8: le message "welcome" n'est plus envoyé par le wrapper (c'est
    // Electron qui le fait après 10 s si la fenêtre n'est pas visible).
    assert.ok(!content.includes('shell.welcome'),
        'wrapper must not send the welcome notification directly (v4.2.8)');
});

test('common.sh: utoutlook_wait_notifications uses silent badge probe (no visible test notification)', async () => {
    const fs = await import('node:fs');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const content = fs.readFileSync(commonPath, 'utf-8');
    // Should NOT send a visible "utoutlook-test" notification (user complaint 28/10)
    assert.ok(!content.includes('"utoutlook-test"'),
        'wait_notifications should not send visible "utoutlook-test" notification');
    // Should use silent --badge 0 probe instead
    assert.ok(content.includes('--badge 0'),
        'wait_notifications should use silent --badge 0 probe');
});

test('notify main.cpp: returns non-zero exit code on failure', async () => {
    const fs = await import('node:fs');
    const mainPath = path.resolve(__dirname, '../../notify_src/main.cpp');
    const content = fs.readFileSync(mainPath, 'utf-8');
    assert.ok(content.includes('return sent ? 0 : 1'),
        'main.cpp should return non-zero when send() fails');
    assert.ok(content.includes('bool sent = notif.send'),
        'main.cpp should capture send() return value');
});

test('notify pushclient.cpp: has D-Bus timeout', async () => {
    const fs = await import('node:fs');
    const clientPath = path.resolve(__dirname, '../../notify_src/pushclient.cpp');
    const content = fs.readFileSync(clientPath, 'utf-8');
    assert.ok(content.includes('DBUS_TIMEOUT_MS'),
        'pushclient.cpp should define a D-Bus timeout');
    assert.ok(content.includes('QDBus::Block, DBUS_TIMEOUT_MS'),
        'pushclient.cpp should use the timeout in D-Bus calls');
});

test('reset_zoom.sh: uses utoutlook_notify', async () => {
    const fs = await import('node:fs');
    const resetPath = path.resolve(__dirname, '../../utils/reset_zoom.sh');
    const content = fs.readFileSync(resetPath, 'utf-8');
    assert.ok(content.includes('utoutlook_notify'),
        'reset_zoom.sh should use utoutlook_notify');
    assert.ok(!content.includes('../bin/notify'),
        'reset_zoom.sh should not call notify binary directly');
});

// ============================================================
// Tests for error screen fixes (v3.2.2 hotfix)
// ============================================================

test('mail-window-controller: addUnreadNumberObserver catches rejections', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // The method should be async and handle executeJavaScript rejections
    assert.ok(content.includes('async addUnreadNumberObserver()'),
        'addUnreadNumberObserver should be async');
    // Should have try-catch around executeJavaScript
    const methodStart = content.indexOf('async addUnreadNumberObserver()');
    const methodEnd = content.indexOf('injectGestures()', methodStart);
    const methodBody = content.slice(methodStart, methodEnd);
    assert.ok(methodBody.includes('catch'),
        'addUnreadNumberObserver should catch executeJavaScript rejections');
});

test('mail-window-controller: health check verifies page readiness', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes("document.readyState"),
        'Health check should verify page readyState before re-injecting');
    assert.ok(content.includes('pageReady'),
        'Health check should use pageReady guard');
});

test('mail-window-controller: offline detection excludes ERR_ABORTED', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // ERR_ABORTED (-3) should NOT be in the networkErrors list
    const networkErrorsMatch = content.match(/networkErrors\s*=\s*\[([^\]]+)\]/);
    assert.ok(networkErrorsMatch, 'Should have networkErrors array');
    // Parse as numbers to check for -3 as a standalone value
    const errors = networkErrorsMatch[1].split(',').map(s => parseInt(s.trim(), 10));
    assert.ok(!errors.includes(-3),
        'ERR_ABORTED (-3) should be excluded from offline detection (SPA false positive)');
    // But real network errors should still be there
    assert.ok(errors.includes(-105) || errors.includes(-106),
        'Real network errors should still trigger offline detection');
});

test('clickable.yaml: bundles touch binary', async () => {
    const fs = await import('node:fs');
    const yamlPath = path.resolve(__dirname, '../../clickable.yaml');
    const content = fs.readFileSync(yamlPath, 'utf-8');
    assert.ok(content.includes('cp /usr/bin/touch'),
        'clickable.yaml should bundle touch binary (AppArmor blocks /usr/bin/touch)');
});

test('clickable.yaml: bundles cat, tr, cut binaries', async () => {
    const fs = await import('node:fs');
    const yamlPath = path.resolve(__dirname, '../../clickable.yaml');
    const content = fs.readFileSync(yamlPath, 'utf-8');
    for (const bin of ['cat', 'tr', 'cut']) {
        assert.ok(content.includes(`cp /usr/bin/${bin}`),
            `clickable.yaml should bundle ${bin} binary (AppArmor blocks /usr/bin/${bin})`);
    }
});

test('mail-window-controller: observerWasActive tracks observer lifecycle', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('this.observerWasActive'),
        'Controller should track observerWasActive to distinguish initial load from SPA disconnect');
    // Health check should only re-inject if observer was previously active
    assert.ok(content.includes('this.observerWasActive = false') && content.includes('Observer disconnected'),
        'Health check should re-inject only after observer was active (not on initial load)');
});

test('mail-window-controller: single did-stop-loading listener', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // Count did-stop-loading listener registrations
    const matches = content.match(/webContents\.on\(['"]did-stop-loading['"]/g) || [];
    assert.strictEqual(matches.length, 1,
        `Expected exactly 1 did-stop-loading listener (merged), found ${matches.length}`);
});

test('mail-window-controller: logs page URL on navigation', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('getURL()'),
        'Controller should log page URL for session/login diagnostics');
    assert.ok(content.includes('SPA navigation:'),
        'Controller should log SPA navigation URLs');
});

test('main: cleanupAndExit awaits cookie flushStore', async () => {
    const fs = await import('node:fs');
    const mainPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mainPath, 'utf-8');
    // cleanupAndExit should be async and await flushStore
    assert.ok(content.includes('async cleanupAndExit()'),
        'cleanupAndExit should be async to await cookie flush');
    assert.ok(content.includes('await session.fromPartition'),
        'cleanupAndExit should await flushStore on partition session');
    assert.ok(content.includes('await session.defaultSession'),
        'cleanupAndExit should await flushStore on default session');
});

test('mail-window-controller: CSP script-src includes CDN domains', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // script-src must include CDN domains, not just default-src,
    // otherwise Outlook boot JS from CDNs is blocked (olkerror.html?esrc=NoBootJs)
    // v4.0.51: CSP refactorisé en constantes MS_BASE + MS_CDN réutilisées dans chaque directive
    const cspMatch = content.match(/script-src[^;]+/);
    assert.ok(cspMatch, 'CSP should have script-src directive');
    for (const domain of ['msocdn.com', 'msecnd.net', 'msftauth.net', 'cdn.office.net', 'onecdn.static.microsoft', 'microsoftonline.com']) {
        assert.ok(cspMatch[0].includes('MS_CDN') && content.includes(domain),
            `script-src must use MS_CDN containing ${domain} (Outlook boot JS served from CDN)`);
    }
});

test('mail-window-controller: logs failed resource loads', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes("on('did-fail-load'"),
        'Controller should log did-fail-load events for diagnostics');
    assert.ok(content.includes('Load failed'),
        'Controller should log load failure details (errorCode, description, URL)');
});

test('observer: script wrapped in IIFE to prevent re-declaration errors', async () => {
    const fs = await import('node:fs');
    const obsPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(obsPath, 'utf-8');
    // Top-level const/let in executeJavaScript global scope causes
    // "Identifier already declared" on re-injection — must be wrapped in IIFE
    assert.ok(content.trimStart().startsWith('(() => {') || content.includes('(() => {'),
        'Observer script should be wrapped in IIFE to prevent re-declaration errors');
    assert.ok(content.trimEnd().endsWith('})();') || content.trimEnd().endsWith('})(); // end IIFE'),
        'Observer script should close the IIFE');
});

test('main: heartbeat auto-exit timeout is 60s (not 10s)', async () => {
    const fs = await import('node:fs');
    const mainPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mainPath, 'utf-8');
    // 10s was too short — Outlook web app can take 30s+ to load on slow
    // devices, causing the app to kill itself before the window appears
    assert.ok(content.includes('heartbeatSeconds > 60'),
        'Heartbeat auto-exit should be 60s (Outlook load can take 30s+ on mobile)');
    assert.ok(!content.includes('heartbeatSeconds > 10'),
        'Heartbeat auto-exit should NOT be 10s (too short for Outlook load)');
});

test('tray-controller: launcher badge capped at 99', async () => {
    const fs = await import('node:fs');
    const trayPath = path.resolve(__dirname, '../src/controller/tray-controller.mjs');
    const content = fs.readFileSync(trayPath, 'utf-8');
    assert.ok(content.includes('Math.min(count || 0, 99)'),
        'Launcher badge should cap count at 99 (larger numbers overflow the small badge)');
});

test('assets: simplified logo exists for launcher icon', async () => {
    const fs = await import('node:fs');
    const simpleLogo = path.resolve(__dirname, '../../assets/logo-simple.png');
    const launcherLogo = path.resolve(__dirname, '../../assets/logo.png');
    assert.ok(fs.existsSync(simpleLogo), 'Simplified logo (logo-simple.png) should exist');
    assert.ok(fs.existsSync(launcherLogo), 'Launcher logo (logo.png) should exist');
    // v4.1.0: comparer le CONTENU, pas seulement la taille (F13).
    const crypto = await import('node:crypto');
    const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    assert.strictEqual(hash(launcherLogo), hash(simpleLogo),
        'Launcher logo must be byte-identical to the simplified version');
});

// ============================================================
// Tests for hotfix #7c — cookie sync office.com → live.com
// ============================================================

test('mail-window-controller: has syncCookiesToLiveCom method', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('async syncCookiesToLiveCom()'),
        'Controller should have syncCookiesToLiveCom method for personal account cookie sync');
    assert.ok(content.includes("sameSite: 'no_restriction'"),
        'Synced cookies should use SameSite=None (no_restriction) for cross-site office.com ↔ live.com');
});

test('mail-window-controller: loopDetectorRetries capped at 3', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('this.loopDetectorRetries'),
        'Controller should track loopDetectorRetries to prevent infinite loops');
    assert.ok(content.includes('this.loopDetectorRetries >= 3'),
        'Loop detector should give up after 3 retries and navigate to office.com for fresh login');
});

test('mail-window-controller: CSP includes live.net domains', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // Count occurrences of *.live.net in CSP directives
    // v4.0.51: refactor en constantes — *.live.net dans MS_CDN, réutilisé par chaque directive
    assert.ok(content.includes('*.live.net'),
        'CSP should include *.live.net (in MS_CDN constant reused by all directives)');
});

test('mail-window-controller: login_hint intercept syncs cookies', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // The will-navigate handler for login_hint should call syncCookiesToLiveCom
    const willNavigateStart = content.indexOf("on('will-navigate'");
    assert.ok(willNavigateStart !== -1, 'Controller should have will-navigate handler');
    const willNavigateSection = content.slice(willNavigateStart, willNavigateStart + 1500);
    assert.ok(willNavigateSection.includes('syncCookiesToLiveCom'),
        'will-navigate login_hint handler should call syncCookiesToLiveCom before loading');
    assert.ok(willNavigateSection.includes('login_hint preserved') || willNavigateSection.includes('keep login_hint'),
        'will-navigate handler should preserve login_hint (not strip it)');
});

test('mail-window-controller: loop detector uses cookie sync instead of clear session', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    // In the redirect loop handler, should call syncCookiesToLiveCom, not clearOutlookSession
    const loopHandlerStart = content.indexOf('Redirect loop detected');
    assert.ok(loopHandlerStart !== -1, 'Should have redirect loop detection logic');
    const loopHandlerSection = content.slice(loopHandlerStart, loopHandlerStart + 1200);
    assert.ok(loopHandlerSection.includes('syncCookiesToLiveCom'),
        'Loop detector should sync cookies (not just clear session)');
    assert.ok(!loopHandlerSection.includes('clearOutlookSession()'),
        'Loop detector should NOT clear session (cookie sync replaces that approach)');
});

// ============================================================
// Tests for hotfix #8 — persistent observer state (no false notifications)
// ============================================================

test('observer: state persists in window.__utoutlookState across re-injections', async () => {
    const fs = await import('node:fs');
    const obsPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(obsPath, 'utf-8');
    assert.ok(content.includes('window.__utoutlookState'),
        'Observer should use window.__utoutlookState for persistent state across re-injections');
    assert.ok(content.includes('const state = window.__utoutlookState'),
        'Observer should reference persistent state via a local const alias');
    // Should NOT have standalone lastUnreadCount / lastReminderCount as let variables
    // (they would reset on re-injection)
    const standaloneMatches = content.match(/^let (lastUnreadCount|lastReminderCount|lastUnreadNotificationTime|lastCalendarNotificationTime)/gm) || [];
    assert.strictEqual(standaloneMatches.length, 0,
        `Observer should NOT declare lastUnread* as standalone let variables (found: ${standaloneMatches.join(', ')})`);
});

test('observer: skips check when inbox title is missing (SPA re-render guard)', async () => {
    const fs = await import('node:fs');
    const obsPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(obsPath, 'utf-8');
    assert.ok(content.includes('titleValid'),
        'Observer should track title validity to detect SPA re-render');
    assert.ok(content.includes('!titleValid'),
        'Observer should skip check when title is missing/unparseable');
    assert.ok(content.includes('DOM mid-render'),
        'Observer should log when skipping due to mid-render DOM');
});

// ============================================================
// Tests for hotfix #11 — regression: new-mail notification never fired.
// hotfix #9 assigned state.lastUnreadCount = unread BEFORE the
// "unread > lastUnreadCount" comparison, so the comparison was always
// false (unread > unread) and showNotification() was never reached.
// ============================================================

test('observer: new-mail notification compares against previous count (hotfix #11)', async () => {
    const fs = await import('node:fs');
    const obsPath = path.resolve(__dirname, '../public/unread-number-observer.js');
    const content = fs.readFileSync(obsPath, 'utf-8');

    // The previous unread count must be captured BEFORE state.lastUnreadCount
    // is updated, so the "increased?" test uses the real previous value.
    const captureIdx = content.indexOf('const previousUnreadCount = state.lastUnreadCount');
    assert.ok(captureIdx !== -1,
        'Observer should capture previousUnreadCount = state.lastUnreadCount before updating it');

    const updateIdx = content.indexOf('state.lastUnreadCount = unread;');
    assert.ok(updateIdx !== -1, 'Observer should update state.lastUnreadCount');
    assert.ok(captureIdx < updateIdx,
        'previousUnreadCount must be captured BEFORE state.lastUnreadCount is updated');

    // The new-mail notification must compare unread against the PREVIOUS count,
    // not the just-updated state.lastUnreadCount (which equals unread → always false).
    assert.ok(content.includes('unread > previousUnreadCount && !silentNotifications'),
        'New-mail notification should compare unread > previousUnreadCount');

    // The zero-unread confirmation must also key off the previous count.
    assert.ok(content.includes('unread === 0 && previousUnreadCount > 0'),
        'Zero-unread confirmation should use previousUnreadCount');
});

// ============================================================
// Tests for hotfix #12 — the heartbeat auto-exit used to kill the
// app ~2 min after it was backgrounded: hideOnClose/hideOnMinimize
// hide the window on background, isVisible() becomes false, and the
// old "no visible window for 60 heartbeats" rule exited the app, so
// background notifications stopped. The auto-exit must now be a
// startup-failure safety net only: once the window has been shown at
// least once (windowEverVisible), the app must never auto-exit.
// ============================================================

test('main: heartbeat auto-exit only fires if the window never appeared (hotfix #12)', async () => {
    const fs = await import('node:fs');
    const mainPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mainPath, 'utf-8');

    // windowEverVisible must be tracked and set once a window is visible.
    assert.ok(content.includes('let windowEverVisible = false'),
        'Heartbeat should declare windowEverVisible (hotfix #12)');
    assert.ok(content.includes('windowEverVisible = true'),
        'windowEverVisible should be set once a window is visible (hotfix #12)');

    // The auto-exit must require the window to have NEVER been visible.
    // Gating on the *current* visibleCount would kill the app in the
    // background (window hidden -> isVisible() false).
    assert.ok(content.includes('!windowEverVisible && heartbeatSeconds > 60'),
        'Auto-exit must be gated on !windowEverVisible, not the current visible count (hotfix #12)');

    // Once shown, the counter keeps cycling (command.sh treats a static
    // counter as a dead/frozen app) instead of exiting.
    assert.ok(content.includes('windowEverVisible && heartbeatSeconds > 60'),
        'Counter reset should key off windowEverVisible so the app lives on in background (hotfix #12)');
});

// ============================================================
// Tests for the launcher badge fix (feature/notifications).
// setBadgeCount() used to call com.lomiri.LauncherEntry.Update, which
// does not exist on UT 24.04 -> the badge never showed. It must now use
// the official com.lomiri.Postal.SetCounter API (which drives the Lomiri
// launcher badge). Also, the constructor and send() must NOT call
// updateCount(): utoutlook posts one-shot notifications without a tag,
// so m_tags stays empty and updateCount() resets the badge (unread
// count) to 0 on every notify invocation.
// ============================================================

test('notify pushclient.cpp: setBadgeCount drives the badge via Postal.SetCounter (badge fix)', async () => {
    const fs = await import('node:fs');
    const clientPath = path.resolve(__dirname, '../../notify_src/pushclient.cpp');
    const content = fs.readFileSync(clientPath, 'utf-8');

    const badgeStart = content.indexOf('bool PushClient::setBadgeCount');
    assert.ok(badgeStart !== -1, 'pushclient.cpp should define setBadgeCount');
    const badgeEnd = content.indexOf('bool PushClient::', badgeStart + 1);
    const badgeBody = content.slice(badgeStart, badgeEnd === -1 ? undefined : badgeEnd);

    assert.ok(badgeBody.includes('"SetCounter"'),
        'setBadgeCount should call com.lomiri.Postal.SetCounter (drives the Lomiri launcher badge)');
    assert.ok(badgeBody.includes('<< count << (count > 0)'),
        'setBadgeCount should pass (count, count>0) to SetCounter');

    // The dead com.lomiri.LauncherEntry path must be gone entirely.
    assert.ok(!content.includes('#define LAUNCHER_SERVICE'),
        'LAUNCHER_SERVICE define should be removed (com.lomiri.LauncherEntry absent on UT 24.04)');
    assert.ok(!content.includes('makeLauncherPath'),
        'makeLauncherPath should be removed (LauncherEntry no longer used)');
});

test('notify pushclient.cpp/.h: constructor and send() no longer reset the badge (badge fix)', async () => {
    const fs = await import('node:fs');
    const clientPath = path.resolve(__dirname, '../../notify_src/pushclient.cpp');
    const headerPath = path.resolve(__dirname, '../../notify_src/pushclient.h');
    const content = fs.readFileSync(clientPath, 'utf-8');
    const header = fs.readFileSync(headerPath, 'utf-8');
    // Ignore // comments so the explanatory hotfix notes don't count as calls.
    const code = content.replace(/\/\/[^\n]*/g, '');

    // Constructor must not call updateCount() (resets badge to 0, m_tags empty).
    const ctorStart = code.indexOf('PushClient::PushClient');
    const ctorEnd = code.indexOf('QJsonObject PushClient::buildNotification', ctorStart);
    const ctorBody = code.slice(ctorStart, ctorEnd === -1 ? undefined : ctorEnd);
    assert.ok(!ctorBody.includes('updateCount('),
        'Constructor must not call updateCount() — it wipes the unread badge on every notify run');

    // send() must not call updateCount(tag) after posting.
    const sendStart = code.indexOf('bool PushClient::send(const QJsonObject &message)');
    const sendEnd = code.indexOf('bool PushClient::setBadgeCount', sendStart);
    const sendBody = code.slice(sendStart, sendEnd === -1 ? undefined : sendEnd);
    assert.ok(!sendBody.includes('updateCount('),
        'send() must not call updateCount(tag) — it wipes the unread badge after each notification');

    // makeLauncherPath declaration removed from the header too.
    assert.ok(!header.includes('makeLauncherPath'),
        'pushclient.h should no longer declare makeLauncherPath');
});

// ============================================================
// Tests for hotfix #13 — the observer fires show-notification on
// every unread-count change, including SPA re-renders that cause
// temporary fluctuations. When the app is already in the foreground
// (window visible + focused), showing a Lomiri notification is
// jarring: the blue banner slides down, shows the envelope icon,
// then dismisses — while the user is already looking at the app.
// The IPC handler must suppress the notification in this case.
// The badge (updateUnread) still updates normally via its own channel.
// ============================================================

test('mail-window-controller: show-notification IPC suppressed when window is visible+focused (hotfix #13)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // The IPC handler must check visibility before calling handleNotification.
    assert.ok(content.includes('this.win.isVisible() && this.win.isFocused()'),
        'show-notification handler should check isVisible() && isFocused() (hotfix #13)');

    // The suppression must return early (skip handleNotification).
    assert.ok(content.includes('[NOTIFICATION SUPPRESSED]'),
        'show-notification handler should log suppression and return early (hotfix #13)');

    // handleNotification must still exist for background notifications.
    assert.ok(content.includes('handleNotification(title, body, icon)'),
        'handleNotification must still be called for background notifications (hotfix #13)');

    // The check must be inside the show-notification IPC handler, not global.
    const ipcStart = content.indexOf('"show-notification"');
    const ipcEnd = content.indexOf('this._on(ipcMain,', ipcStart + 1);
    const ipcBody = content.slice(ipcStart, ipcEnd === -1 ? undefined : ipcEnd);
    assert.ok(ipcBody.includes('isVisible()') && ipcBody.includes('isFocused()'),
        'Visibility check must be inside the show-notification IPC handler (hotfix #13)');
    assert.ok(ipcBody.includes('return;'),
        'Suppression must return early to skip handleNotification (hotfix #13)');
});

// ============================================================
// Tests for hotfix #14 — false page reloads during normal use.
// setupOfflineDetection() used to react to EVERY did-fail-load event,
// including sub-resources (images, scripts, XHRs). A single failed
// image would trigger the offline overlay + connectivity monitor,
// which called win.reload() when navigator.onLine returned true.
// This caused a jarring flash: blue progress bar → page reload →
// Outlook splash envelope animation → back to app.
// Fix: filter did-fail-load to isMainFrame only, and remove the
// reload from the connectivity monitor (SPA reconnects on its own).
// ============================================================

test('mail-window-controller: did-fail-load offline detection only fires on main frame (hotfix #14)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // Find the setupOfflineDetection did-fail-load handler (not the logger one).
    const offlineStart = content.indexOf('setupOfflineDetection()');
    const offlineEnd = content.indexOf('showOfflineOverlay()', offlineStart);
    const offlineBody = content.slice(offlineStart, offlineEnd);

    // The handler must accept isMainFrame and filter on it.
    assert.ok(offlineBody.includes('isMainFrame'),
        'setupOfflineDetection did-fail-load handler must accept isMainFrame (hotfix #14)');
    assert.ok(offlineBody.includes('if (!isMainFrame) return;'),
        'setupOfflineDetection must skip non-main-frame failures (hotfix #14)');
});

test('mail-window-controller: connectivity monitor does NOT reload the page (hotfix #14)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // Find startConnectivityMonitor and extract its body.
    const monStart = content.indexOf('startConnectivityMonitor()');
    const monEnd = content.indexOf('async injectStyles', monStart);
    const monBody = content.slice(monStart, monEnd);

    // The connectivity monitor must NOT call win.reload() — that causes
    // the jarring flash (progress bar → reload → Outlook splash → back).
    assert.ok(!monBody.includes('this.win.reload()'),
        'Connectivity monitor must not reload the page (hotfix #14) — SPA reconnects on its own');

    // It should still hide the overlay and send a notification.
    assert.ok(monBody.includes('hideOfflineOverlay()'),
        'Connectivity monitor should still hide the offline overlay (hotfix #14)');
    assert.ok(monBody.includes('notif.online.title'),
        'Connectivity monitor should still send online notification (hotfix #14)');
});

// ============================================================
// Tests for hotfix #15 — splash lifecycle + welcome notification.
//
// Problem 1 (splash): the splash used to close on the FIRST dom-ready,
// which fires during Outlook's redirect chain (outlook.com →
// outlook.office.com → …). The user saw: splash → half-loaded page
// with Outlook's envelope loading screen → blue progress bar →
// fully loaded mail. Fix: keep the splash open until did-finish-load
// fires on the actual mail interface URL (or a login page).
//
// Problem 2 (welcome notification): command.sh called the notify
// binary without DBUS_SESSION_BUS_ADDRESS / XDG_RUNTIME_DIR. The
// Qt binary uses QDBusConnection::sessionBus() which needs these
// env vars — without them, the D-Bus call silently fails.
// ============================================================

test('mail-window-controller: splash is NOT closed on dom-ready (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // Find the dom-ready handler body.
    const domReadyStart = content.indexOf('"dom-ready"');
    const domReadyEnd = content.indexOf('did-navigate-in-page', domReadyStart);
    const domReadyBody = content.slice(domReadyStart, domReadyEnd);

    // The dom-ready handler must NOT close the splash or show the window.
    assert.ok(!domReadyBody.includes('closeSplashWindow()'),
        'dom-ready handler must NOT close the splash (hotfix #15) — did-finish-load decides');
    assert.ok(!domReadyBody.includes('this.win.show()'),
        'dom-ready handler must NOT show the window (hotfix #15)');
});

test('mail-window-controller: splash closes on did-finish-load with mail/login URL (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // Find the did-finish-load handler in loadMainUrl.
    const dfLoadStart = content.indexOf("'did-finish-load'");
    const dfLoadEnd = content.indexOf('fs.writeFile(LOGIN_FLAG_FILE', dfLoadStart);
    const dfLoadBody = content.slice(dfLoadStart, dfLoadEnd);

    // Must check isMailInterfaceUrl and isLoginPageUrl.
    assert.ok(dfLoadBody.includes('isMailInterfaceUrl'),
        'did-finish-load must check isMailInterfaceUrl (hotfix #15)');
    assert.ok(dfLoadBody.includes('isLoginPageUrl'),
        'did-finish-load must check isLoginPageUrl (hotfix #15)');
    assert.ok(dfLoadBody.includes('closeSplashWindow()'),
        'did-finish-load must close the splash when URL is mail interface or login (hotfix #15)');
});

test('mail-window-controller: isMailInterfaceUrl detects mail pages correctly (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // Extract the isMailInterfaceUrl method body.
    const start = content.indexOf('isMailInterfaceUrl(url)');
    const end = content.indexOf('isLoginPageUrl(url)', start);
    const body = content.slice(start, end);

    assert.ok(body.includes("/mail/"), 'isMailInterfaceUrl must check for /mail/ path');
    assert.ok(body.includes("login"), 'isMailInterfaceUrl must exclude login URLs');
    assert.ok(body.includes("oauth"), 'isMailInterfaceUrl must exclude oauth URLs');
});

test('mail-window-controller: isLoginPageUrl detects login pages correctly (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    const start = content.indexOf('isLoginPageUrl(url)');
    const end = content.indexOf('createWindow()', start);
    const body = content.slice(start, end);

    assert.ok(body.includes('login.live.com'), 'isLoginPageUrl must detect login.live.com');
    assert.ok(body.includes('login.microsoftonline.com'), 'isLoginPageUrl must detect login.microsoftonline.com');
    assert.ok(body.includes('oauth'), 'isLoginPageUrl must detect oauth URLs');
});

test('mail-window-controller: closeSplashWindow is guarded by splashClosed flag (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    const start = content.indexOf('closeSplashWindow()');
    const end = content.indexOf('isMailInterfaceUrl(url)', start);
    const body = content.slice(start, end);

    assert.ok(body.includes('if (this.splashClosed) return;'),
        'closeSplashWindow must be idempotent — guard with splashClosed flag (hotfix #15)');
    assert.ok(body.includes('this.splashClosed = true'),
        'closeSplashWindow must set splashClosed = true (hotfix #15)');
    assert.ok(body.includes('this.win.show()'),
        'closeSplashWindow must show the main window when splash closes (hotfix #15)');
});

test('mail-window-controller: progress bar is skipped while splash is open (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    // Find the method definition (not the call site in init()).
    const start = content.indexOf('    setupLoadingIndicators() {');
    const end = content.indexOf('    setupContextMenu()', start);
    const body = content.slice(start, end);

    assert.ok(body.includes('if (!this.splashClosed) return;'),
        'did-start-loading must skip setProgressBar while splash is open (hotfix #15)');
});

test('mail-window-controller: splash timeout is 15s (v4.0.36)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    const start = content.indexOf('splashTimeout = setTimeout');
    const end = content.indexOf('}, 15000);', start) + 10;
    const body = content.slice(start, end);

    assert.ok(body.includes('15000'),
        'Splash safety timeout is 15s (v4.0.36) — normal close is 4-8s, so 15s only fires when stuck');
});

test('command.sh: exports D-Bus environment variables for notify binary (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');

    assert.ok(content.includes('XDG_RUNTIME_DIR'),
        'command.sh must export XDG_RUNTIME_DIR for the notify binary (hotfix #15)');
    assert.ok(content.includes('DBUS_SESSION_BUS_ADDRESS'),
        'command.sh must export DBUS_SESSION_BUS_ADDRESS for the notify binary (hotfix #15)');
    assert.ok(content.includes('unix:path='),
        'DBUS_SESSION_BUS_ADDRESS must use unix:path= scheme (hotfix #15)');
});

test('notify pushclient.cpp: buildNotification does NOT include actions field (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const cppPath = path.resolve(__dirname, '../../notify_src/pushclient.cpp');
    const content = fs.readFileSync(cppPath, 'utf-8');

    // Extract buildNotification method body.
    const start = content.indexOf('PushClient::buildNotification(const QString &title, const QString &body)');
    const end = content.indexOf('PushClient::buildSummaryMessage', start);
    const body = content.slice(start, end);

    // The "actions" field must NOT be present — it causes the Lomiri Postal
    // service to silently skip the popup (no Notify call to org.freedesktop.Notifications).
    // Verified on device: notifications with "actions" never appear as banners.
    assert.ok(!body.includes('c["actions"]'),
        'buildNotification must NOT include "actions" field (hotfix #15) — Postal skips popup when actions present');
    assert.ok(!body.includes('QJsonArray actions'),
        'buildNotification must NOT declare actions array (hotfix #15)');
});

test('gestures.js: pull-down only blocks when the real scroll container is at top (v3.3.3)', async () => {
    const fs = await import('node:fs');
    const gPath = path.resolve(__dirname, '../public/gestures.js');
    const content = fs.readFileSync(gPath, 'utf-8');

    // The SPA scrolls inside an inner div, window.scrollY is always 0 —
    // the old check window.scrollY === 0 made every downward slide get
    // preventDefault()'d (blue bar shown, list frozen).
    assert.ok(content.includes('findScrollContainer'),
        'gestures.js must locate the real scrollable ancestor (findScrollContainer)');
    assert.ok(/pullContainer\.scrollTop <= 0/.test(content),
        'pull-to-refresh must check the scroll container scrollTop, not window.scrollY');
    assert.ok(/if \(pullContainer\.scrollTop > 0 \|\| window\.scrollY > 0\)/.test(content),
        'touchmove must NOT preventDefault when the list can still scroll (v3.3.3)');
});

test('command.sh: startup is resilient to slow network and slow Electron (v3.3.3)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');

    // test_net must not quit the app when the network is not up yet —
    // it used to run qmlscene nonetwork.qml + close_command (1 launch in
    // 2-3 failed at wake-up because DNS/4G was not ready within 1s).
    const netStart = content.indexOf('function test_net()');
    const netEnd = content.indexOf('\nfunction ', netStart + 10);
    const netBody = content.slice(netStart, netEnd);
    assert.ok(!netBody.includes('close_command'),
        'test_net must NOT quit the app on missing connectivity (v3.3.3)');
    assert.ok(!netBody.includes('nonetwork.qml'),
        'test_net must NOT show nonetwork.qml at startup (v3.3.3)');
    assert.ok(netBody.includes('nc -zw2'),
        'test_net should retry with a 2s timeout per probe (v3.3.3)');

    // The stale heartbeat file from the previous session used to cause a
    // false "stagnation" detection while Electron was still cold-starting.
    assert.ok(content.includes('rm -f ${filelifefollow}'),
        'command.sh must delete the stale heartbeat file before launching (v3.3.3)');
    assert.ok(content.includes('startupGrace'),
        'verify_prospect_life must have a startup grace window when heartbeat is absent (v3.3.3)');
});

test('settings: window behaves like a native UT app — no X11 frame, close quits (v3.3.4)', async () => {
    const fs = await import('node:fs');
    const sPath = path.resolve(__dirname, '../src/settings.mjs');
    const content = fs.readFileSync(sPath, 'utf-8');

    // v4.4.4: on force un vrai quit a la fermeture (plus de masquage)
    // the window while the process kept running; the next launcher tap raised a
    // hidden window = nothing appeared ("app does not start", 1 in 2-3 launches).
    assert.ok(/showWindowFrame:\s*false/.test(content),
        'showWindowFrame default must be false on UT (v3.3.4)');
    assert.ok(/hideOnClose:\s*false/.test(content),
        'hideOnClose default must be false so Lomiri can relaunch (v4.4.4)');
    assert.ok(/hideOnMinimize:\s*true/.test(content),
        'hideOnMinimize default must be true on UT (v4.0.23)');
});

test('main.mjs: single-instance lock + force-show if main window never appears (v3.3.4)', async () => {
    const fs = await import('node:fs');
    const mPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mPath, 'utf-8');

    assert.ok(content.includes('requestSingleInstanceLock'),
        'main.mjs must request the single-instance lock (v3.3.4) — the second-instance handler was dead code without it');
    assert.ok(!/if \(!app\.requestSingleInstanceLock\(\)\) \{[^}]*app\.exit\(0\)/s.test(content),
        'must NOT app.exit(0) when the lock is unavailable — AppArmor blocks the singleton socket dir on UT, quitting on lock failure broke every launch (v3.3.5)');
    assert.ok(content.includes('mainWindowEverVisible'),
        'heartbeat must track main-window visibility separately from the splash (v3.3.4)');
    assert.ok(content.includes('forcing show()'),
        'heartbeat must force show() if the main window never appeared after 60s (v3.3.4)');
});

test('main.mjs: close flag file is NEVER honored — deleted on sight (v4.0.22)', async () => {
    const fs = await import('node:fs');
    const mPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mPath, 'utf-8');

    // v4.0.22: the close flag caused repeated "slow splash then exit on relaunch"
    // races — it is now simply deleted, the wrapper stops the app via socket quit.
    assert.ok(content.includes('NO LONGER honored'),
        'main.mjs must document that the close flag is no longer honored (v4.0.22)');
    assert.ok(content.includes('unlinkSync(CLOSE_FLAG_FILE)'),
        'main.mjs must delete the close flag without honoring it (v4.0.22)');
    assert.ok(!content.includes('app.exit(0);\n            } else'),
        'main.mjs must not exit on close flag anymore (v4.0.22)');
});

test('command.sh + common.sh: orphan wrappers killed, double stagnation, sleep fallback (v3.3.5)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const cmd = fs.readFileSync(cmdPath, 'utf-8');
    const common = fs.readFileSync(commonPath, 'utf-8');

    assert.ok(common.includes('utoutlook_kill_stale_wrappers'),
        'common.sh must define utoutlook_kill_stale_wrappers (v3.3.5)');
    assert.ok(cmd.includes('utoutlook_kill_stale_wrappers'),
        'command.sh cleanup must kill orphaned wrappers (v3.3.5)');
    assert.ok(/stagnantCount.*-ge 2/s.test(cmd) || cmd.includes('-ge 2'),
        'verify_prospect_life must require 2 consecutive stagnations before giving up (v3.3.5)');
    assert.ok(cmd.includes('/bin/sleep "$1" 2>/dev/null'),
        'sleep_int must fall back to /bin/sleep if the bundled binary is missing (v3.3.5)');
});

test('settings: persisted window flags forced to native UT behavior (v4.0.23)', async () => {
    const fs = await import('node:fs');
    const sPath = path.resolve(__dirname, '../src/settings.mjs');
    const content = fs.readFileSync(sPath, 'utf-8');

    // v4.0.23: showWindowFrame=false + startMinimized=false are still forced, but
    // v4.4.4: hideOnClose force false, hideOnMinimize reste true
    // window (process stays alive for notifications; relaunch is instant).
    assert.ok(content.includes("'showWindowFrame', false") && content.includes("'hideOnClose', false") && content.includes("'startMinimized', false"),
        'settings.mjs must force showWindowFrame=false, hideOnClose=false, startMinimized=false (v4.4.4)');
    assert.ok(!/for \(const key of \['showWindowFrame', 'hideOnClose', 'hideOnMinimize'\]\)/.test(content),
        'settings.mjs must NOT force hideOnClose/hideOnMinimize=false anymore (v4.0.23)');
});

test('command.sh/common.sh: wrapper pidfile kills orphaned wrappers without pgrep (v3.3.7)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const cmd = fs.readFileSync(cmdPath, 'utf-8');
    const common = fs.readFileSync(commonPath, 'utf-8');

    // pgrep -f may be blocked by AppArmor under confinement (reading
    // /proc/*/cmdline of other processes) — the pidfile is the reliable path.
    assert.ok(cmd.includes('wrapper.pid') && cmd.includes('echo $$ >'),
        'command.sh must write its PID to wrapper.pid at startup (v3.3.7)');
    // v4.0.94: le pid du pidfile n'est tué qu'après vérification (kill -0 +
    // /proc/<pid>/cmdline) — le log "pgrep fallback found" imprimé à chaque
    // lancement a été retiré (faux « zombies tués au démarrage »).
    assert.ok(common.includes('wrapper.pid') && common.includes('kill -0 "$pid"'),
        'utoutlook_pid_is_wrapper must probe the pidfile PID with kill -0 (v4.0.94)');
    assert.ok(common.includes('/proc/${pid}/cmdline'),
        'pidfile PID must be verified as a command.sh wrapper before SIGKILL (v4.0.94)');
    assert.ok(common.includes('(pgrep)'),
        'pgrep fallback must stay (logs only when it actually kills, v4.0.94)');
});

test('command.sh: GPU options must not allow the "GPU process isn\'t usable. Goodbye." FATAL (v3.3.8)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');

    // --disable-gpu + --disable-software-rasterizer left no fallback (swiftshader
    // lib was stripped from the package): when the separate GPU process failed to
    // spawn 3x (error_code=1002, intermittent), Chromium FATAL'd and killed the app.
    // v4.1.0: les flags sont calculés par compute_gpu_options() pour les deux
    // modes (la bascule auto doit pouvoir les recalculer à chaque relance).
    const all = [...content.matchAll(/gpuoptions="([^"]*)"/g)].map(m => m[1]);
    assert.ok(all.length >= 2, 'both hardware and software gpuoptions must be defined (v4.1.0)');
    for (const opts of all) {
        assert.ok(!opts.includes('--disable-software-rasterizer'),
            'must NOT disable software rasterizer — no GPU fallback on the phone (v3.3.8)');
        assert.ok(opts.includes('--in-process-gpu'),
            'must use --in-process-gpu so no separate GPU process is ever spawned (v3.3.8)');
    }
    assert.ok(all.some(o => o.includes('--disable-gpu')),
        'software mode must force CPU compositing (Electron 44 has no ANGLE libs) (v4.1.0)');
});

test('command.sh: on "cleaning" the wrapper RELAUNCHES instead of exiting (v3.3.9)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');

    // Extract verify_prospect_life body
    const start = content.indexOf('function verify_prospect_life()');
    const end = content.indexOf('\nfunction ', start + 10);
    const body = content.slice(start, end);

    assert.ok(body.includes('cleaning and relaunching'),
        'verify_prospect_life must relaunch after cleaning (v3.3.9)');
    assert.ok(!/tried too more[^\n]*\n[^\n]*exit 0/.test(body),
        'verify_prospect_life must NOT exit 0 right after "tried too more" (v3.3.9)');
    assert.ok(body.includes('launchtry=1'),
        'launchtry must reset to 1 when the client is alive, so a later death gets its 3 tries (v3.3.9)');
});

test('command.sh/common.sh: cross-version upgrade safety — fresh close flag + pidfile ownership (v3.3.10)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const commonPath = path.resolve(__dirname, '../../utils/common.sh');
    const cmd = fs.readFileSync(cmdPath, 'utf-8');
    const common = fs.readFileSync(commonPath, 'utf-8');

    // AppArmor blocks signals between different click version labels, so the
    // old process/service can only be stopped via a FRESH close flag (its
    // heartbeat honors flags written after its own boot).
    const killFn = common.slice(common.indexOf('utoutlook_kill_app()'));
    assert.ok(killFn.includes('echo "closed:${UTOUTLOOK_WRAPPER_PID:-unknown}" > "${UTOUTLOOK_EXITCOMMAND}"'),
        'utoutlook_kill_app must write a fresh close flag so the old (cross-label) process quits gracefully (v3.3.10)');

    // The old wrapper must exit when a newer wrapper owns wrapper.pid
    const verifyFn = cmd.slice(cmd.indexOf('function verify_prospect_life()'));
    assert.ok(verifyFn.includes('owns the app — exiting'),
        'verify_prospect_life must exit when wrapper.pid belongs to a newer wrapper (v3.3.10)');
});

test('v3.3.11 cloud.microsoft: CSP autorise *.cloud.microsoft partout', async () => {
    const fs = await import('node:fs');
    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(cPath, 'utf-8');

    // Sans *.cloud.microsoft dans le CSP, la page outlook.cloud.microsoft/mail
    // ne peut ni charger son JS ni faire ses XHR de session → Microsoft redirige
    // vers prompt=select_account ("compte que vous pouvez utiliser ici").
    // v4.0.51: refactor en constantes — *.cloud.microsoft dans MS_BASE réutilisé partout
    assert.ok(content.includes('*.cloud.microsoft'),
        'CSP must allow *.cloud.microsoft (in MS_BASE constant reused by all directives) (v3.3.11)');
    // connect-src est maintenant permissif (https: wss:) en v4.0.51
    assert.ok(content.includes('connect-src') && content.includes('wss:'),
        'CSP connect-src must allow wss: (v4.0.51 permissive)');
});

test('v3.3.11 cloud.microsoft: cookie sync copie aussi vers .cloud.microsoft', async () => {
    const fs = await import('node:fs');
    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(cPath, 'utf-8');

    const fn = content.slice(content.indexOf('async syncCookiesToLiveCom()'));
    assert.ok(fn.includes("'.cloud.microsoft'") && fn.includes("'outlook.cloud.microsoft'"),
        'syncCookiesToLiveCom must also target .cloud.microsoft / outlook.cloud.microsoft (v3.3.11)');
});

test('v3.3.11 cloud.microsoft: urlsExternal/urlsInternal + login_hint + select_account + loop detector', async () => {
    const fs = await import('node:fs');
    const sPath = path.resolve(__dirname, '../src/settings.mjs');
    const settings = fs.readFileSync(sPath, 'utf-8');
    assert.ok(settings.includes('"outlook.cloud.microsoft"'),
        'urlsExternal must include outlook.cloud.microsoft (v3.3.11)');
    assert.ok(settings.includes('"outlook.cloud.microsoft/mail/deeplink"'),
        'urlsInternal must include outlook.cloud.microsoft/mail/deeplink (v3.3.11)');

    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const ctrl = fs.readFileSync(cPath, 'utf-8');

    assert.ok(ctrl.includes("url.includes('outlook.cloud.microsoft/mail')") && ctrl.includes('login_hint='),
        'will-navigate login_hint intercept must cover cloud.microsoft (v3.3.11)');
    assert.ok(!ctrl.includes('prompt=none') && !ctrl.includes('selectAccountRewrites'),
        'must NOT rewrite prompt=select_account to prompt=none — user wants to click the account himself (v3.3.11)');
    assert.ok(ctrl.includes("url.includes('outlook.cloud.microsoft/mail')"),
        'loop detector must count cloud.microsoft mail pages (v3.3.11)');
});

test('main.css: skeleton/shimmer cachés UNIQUEMENT dans les conteneurs de liste (v3.3.12)', async () => {
    const fs = await import('node:fs');
    const cssPath = path.resolve(__dirname, '../public/main.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Sur la page de login Microsoft (select_account), la tuile « compte que
    // vous pouvez utiliser ici » utilise des classes skeleton/shimmer : cachées
    // globalement, l'utilisateur ne voyait plus son compte.
    const section3 = css.slice(css.indexOf('--- 3.'), css.indexOf('--- 3b.'));
    assert.ok(!/\[class\*="[Ss]keleton"\]/.test(section3) && !/\[class\*="[Ss]himmer"\]/.test(section3),
        'section 3 (globale) must NOT hide skeleton/shimmer anymore (v3.3.12)');
    assert.ok(css.includes('[class*="messageList"] [class*="skeleton"]'),
        'skeleton must still be hidden inside list containers (v3.3.12)');
    assert.ok(css.includes('[role="list"] [class*="shimmer"]'),
        'shimmer must still be hidden inside list containers (v3.3.12)');
});

test('cookie sync: __Host-/__Secure- prefix stripped for cross-domain copies (v3.3.13)', async () => {
    const fs = await import('node:fs');
    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(cPath, 'utf-8');

    // Chromium rejects setting a __Host-/__Secure- cookie with a domain
    // attribute → session cookies (__Host-MSAAUTH) were silently NOT copied
    // → login page lost the account. The copy must strip the prefix.
    const fn = content.slice(content.indexOf('async syncCookiesToLiveCom()'), content.indexOf('startObserverHealthCheck'));
    assert.ok(fn.includes("cookie.name.replace(/^__(?:Host|Secure)-/i, '')"),
        'cookie copy must strip __Host-/__Secure- prefix (v3.3.13)');
    assert.ok(fn.includes('Cookie copy failed'),
        'failed cookie copies must be logged, not silently swallowed (v3.3.13)');
});

test('v3.3.14: cookie sync proactively at startup + eval debug channel', async () => {
    const fs = await import('node:fs');
    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const ctrl = fs.readFileSync(cPath, 'utf-8');

    // The pick-account page could render before cookies were shared (sync only
    // ran on login_hint/#code) → account sometimes not shown.
    const loadFn = ctrl.slice(ctrl.indexOf('loadMainUrl()'), ctrl.indexOf("webContents.on('did-finish-load'"));
    assert.ok(loadFn.includes('syncCookiesToLiveCom()'),
        'loadMainUrl must sync cookies to live.com/cloud.microsoft right away (v3.3.14)');

    const mPath = path.resolve(__dirname, '../src/main.mjs');
    const main = fs.readFileSync(mPath, 'utf-8');
    assert.ok(main.includes('onEval'), 'main.mjs must wire an onEval handler (v3.3.14)');
    const sPath = path.resolve(__dirname, '../src/ipc-socket.mjs');
    const sock = fs.readFileSync(sPath, 'utf-8');
    assert.ok(sock.includes("case 'eval'"), 'ipc-socket must support cmd=eval (v3.3.14)');
});

test('cookie sync: share auth cookies with login.microsoftonline.com too (v3.3.15)', async () => {
    const fs = await import('node:fs');
    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(cPath, 'utf-8');
    const fn = content.slice(content.indexOf('async syncCookiesToLiveCom()'), content.indexOf('startObserverHealthCheck'));

    // The SPA goes straight to login.microsoftonline.com (never via login.live.com),
    // so the persistent auth cookie (__Host-MSAAUTHP on login.live.com) must be
    // copied to login.microsoftonline.com or the pick-account page shows nothing.
    assert.ok(fn.includes("targets.push('outlook.live.com', 'login.microsoftonline.com', '.microsoftonline.com')"),
        'login.live.com cookies must be copied to login.microsoftonline.com (v3.3.15)');
    assert.ok(fn.includes("'login.microsoftonline.com', '.microsoftonline.com')"),
        'all MS cookies must also target login.microsoftonline.com (v3.3.15)');
});

test('v3.3.17: start on office.com (select_account page, NO auto-login) + cookie sync BEFORE first load', async () => {
    const fs = await import('node:fs');
    const sPath = path.resolve(__dirname, '../src/settings.mjs');
    const settings = fs.readFileSync(sPath, 'utf-8');

    // v3.3.16 started on outlook.live.com → mailbox opened DIRECTLY when the
    // session was valid (auto-login). The user wants the select_account page
    // with the account tile to click on — never an automatic sign-in.
    assert.ok(settings.includes('urlMainWindow: "https://outlook.office.com/mail"'),
        'default urlMainWindow must stay outlook.office.com (no auto-login, v3.3.17)');
    assert.ok(!settings.includes("url: 'https://outlook.live.com/mail/'"),
        'default account url must stay office.com (v3.3.17)');

    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const ctrl = fs.readFileSync(cPath, 'utf-8');
    assert.ok(!ctrl.includes('triedOfficeFallback'),
        'no live.com→office.com fallback anymore (v3.3.17)');
    // cookie sync must complete BEFORE the first loadURL so the account tile shows
    const loadFn = ctrl.slice(ctrl.indexOf('async loadMainUrl()'), ctrl.indexOf("webContents.on('did-finish-load'"));
    assert.ok(/await this\.syncCookiesToLiveCom\(\)[\s\S]*loadURL/.test(loadFn),
        'loadMainUrl must await the cookie sync before loadURL (v3.3.17)');
});

test('v3.3.18: login_hint injection shows the account tile WITHOUT auto-login; email never logged', async () => {
    const fs = await import('node:fs');
    const cPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const ctrl = fs.readFileSync(cPath, 'utf-8');

    assert.ok(ctrl.includes('readKnownAccountEmail'),
        'must read the known account email from local leveldb (v3.3.18)');
    assert.ok(ctrl.includes('login_hint=${encodeURIComponent(this.knownEmail)}'),
        'authorize URL must get login_hint=known email so the tile shows (v3.3.18)');
    assert.ok(!ctrl.includes('prompt=none'),
        'still no prompt=none — no auto-login, user clicks the tile (v3.3.18)');
    // the email itself must never appear in logs
    const evalSection = ctrl.slice(ctrl.indexOf('Adding login_hint'));
    assert.ok(!/logger\.(info|warn|error)\([^)]*knownEmail/.test(ctrl),
        'knownEmail must never be logged (confidentiality, v3.3.18)');
});

test('v3.3.19/v3.3.47: splash logo grand (82vw max 900px en v3.3.47) + look UT lecture de mails', async () => {
    const fs = await import('node:fs');
    const splash = fs.readFileSync(path.resolve(__dirname, '../public/splash.html'), 'utf-8');
    // v3.3.19: min(65vw, 768px) like velo-touch; v3.3.47: min(82vw, 900px) (mascotte plus visible)
    assert.ok(splash.includes('min(82vw, 900px)'),
        'splash logo must be min(82vw, 900px) since v3.3.47 (was min(65vw, 768px) in v3.3.19)');
    assert.ok(splash.includes('#0f0f1a'),
        'splash background must be the UT dark #0f0f1a (v3.3.19)');

    const css = fs.readFileSync(path.resolve(__dirname, '../public/main.css'), 'utf-8');
    assert.ok(css.includes('11. Look & feel UBUNTU TOUCH — lecture de mails'),
        'main.css must have section 11 for mail reading look (v3.3.19)');
    for (const sel of ['readingPane', 'messageBody', 'commandBar', 'compose']) {
        assert.ok(css.includes(sel), `section 11 must cover ${sel} (v3.3.19)`);
    }
});

test('v3.3.20: section 11b avec ancres réelles du DOM Outlook (aria-label/data-app-section/role)', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(path.resolve(__dirname, '../public/main.css'), 'utf-8');
    // ancres constatées sur device (classes Fluent = hash, non sémantiques)
    assert.ok(css.includes('[aria-label="Liste des messages"] > div'),
        'items de liste = enfants directs de aria-label="Liste des messages" (v3.3.20)');
    assert.ok(css.includes('[data-app-section="MessageList"]'),
        'ancre data-app-section=MessageList (v3.3.20)');
    assert.ok(css.includes('[role="toolbar"] button') && css.includes('[role="dialog"]'),
        'toolbar actions + dialog compose doivent être stylés (v3.3.20)');
    assert.ok(css.includes("font-family: 'Ubuntu'") && css.includes('not([class*="FontIcon" i])'),
        'police Ubuntu globale sans casser les icônes (v3.3.20)');
});

test('v3.3.20: CSS/gestures injectés aussi dans les fenêtres secondaires (compose) (v3.3.20)', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctrl.includes("this._on(app, 'browser-window-created'"),
        'must listen to browser-window-created to style secondary windows (compose) (v3.3.20)');
    assert.ok(ctrl.includes('async injectStyles(targetWin = null)'),
        'injectStyles must accept a target window (v3.3.20)');
    assert.ok(ctrl.includes('injectGestures(targetWin = null)'),
        'injectGestures must accept a target window (v3.3.20)');
});

test('v3.3.21: notif du nb de non lus même quand la boîte est ouverte + alerte DOM changé + CSS sans thèmes', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    // 1. updateUnread notifie le count même si la fenêtre est visible
    const upd = ctrl.slice(ctrl.indexOf('this._on(ipcMain, "updateUnread"'), ctrl.indexOf('this._on(ipcMain, "show-notification"'));
    assert.ok(upd.includes('lastNotifiedUnread') && upd.includes('notif.newMessages.body'),
        'updateUnread must notify the unread count even when the window is visible (v3.3.21)');
    // 2. urgent bypass la suppression foreground
    const notif = ctrl.slice(ctrl.indexOf('this._on(ipcMain, "show-notification"'));
    assert.ok(notif.includes('!urgent && this.win.isVisible()'),
        'urgent notifications must bypass the foreground suppression (v3.3.21)');
    // 3. plus de thèmes injectés (dark/focus/accent)
    const inj = ctrl.slice(ctrl.indexOf('async injectStyles'));
    assert.ok(!inj.includes('getDarkModeCSS()') && !inj.includes('getFocusModeCSS()') && !inj.includes('getAccentColorCSS('),
        'injectStyles must NOT inject theme variants anymore (v3.3.21)');

    const preload = fs.readFileSync(path.resolve(__dirname, '../src/controller/preload.js'), 'utf-8');
    assert.ok(preload.includes('urgent'), 'preload must pass the urgent flag (v3.3.21)');

    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    assert.ok(obs.includes('domFailCount') && obs.includes('domAlerted') && obs.includes('DOM CHANGED'),
        'observer must alert when the DOM selectors stop matching (v3.3.21)');
});

test('v3.3.21: sélecteur inbox générique (treeitem title "non lus") pour le nouveau DOM', async () => {
    const fs = await import('node:fs');
    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    assert.ok(obs.includes("'[role=\"treeitem\"][title*=\"non lus\" i]'"),
        'inbox selector must include generic treeitem title "non lus" (new DOM, no FolderPane parent) (v3.3.21)');
});

test('v3.3.21: parsing du count dans un title "(251 non lus)" (texte après le nombre)', async () => {
    const fs = await import('node:fs');
    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    assert.ok(obs.includes('/\\((\\d+)[^)]*\\)/g'),
        'title regex must accept text after the number inside parens: (251 non lus) (v3.3.21)');
});

test('v3.3.22: guards this.win null dans les handlers + retry limité à 5 échecs', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    // crash.log: TypeError setProgressBar/webContents of null → app.exit(1)
    assert.ok(ctrl.includes('get alive()'), 'alive getter required (v3.3.22)');
    for (const h of ['did-finish-load', 'did-stop-loading', 'did-start-loading', 'dom-ready', 'did-navigate-in-page', 'will-navigate']) {
        const i = Math.max(ctrl.indexOf(`on('${h}'`), ctrl.indexOf(`on("${h}"`));
        const seg = ctrl.slice(i, i + 600);
        assert.ok(seg.includes('!this.alive'), `handler ${h} must guard !this.alive (v3.3.22)`);
    }
    const showIdx = ctrl.indexOf('async show()');
    assert.ok(ctrl.slice(showIdx, showIdx + 120).includes('!this.alive'),
        'show() must guard !this.alive (v3.3.22)');

    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    assert.ok(obs.includes('retryState.dead') && obs.includes('>= 5'),
        'observer must stop retrying a handler after 5 failures (v3.3.22)');
});

test('v4.1.1: retry persisté entre réinjections (anti-spam « 1/5 » dans wrapper.log)', async () => {
    const fs = await import('node:fs');
    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    assert.ok(obs.includes('window.__utoutlookRetryState'),
        'retry counters must survive re-injection on window (v4.1.1)');
    assert.ok(obs.includes('RETRY_COOLDOWN_MS'),
        'dead handlers must be revived after a cooldown when Outlook comes back (v4.1.1)');
    assert.ok(!obs.includes('const handlerFailCount = {}'),
        'local fail counters must be removed (v4.1.1)');
    assert.equal((obs.match(/debug\('init monitor'\)/g) || []).length, 1,
        'only one "init monitor" log per injection (v4.1.1)');
});

test('v4.1.2: cookie auth sauvegardé par batch (anti-tempête login invisible)', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctrl.includes('_authCookieBatch'),
        'auth cookies must be accumulated in a batch, not written one by one (v4.1.2)');
    assert.ok(ctrl.includes('scheduleAuthCookieFlush'),
        'batch flush must be debounced (v4.1.2)');
    assert.ok(ctrl.includes('AUTH_BATCH_MS'),
        'batch window must be bounded (v4.1.2)');
    assert.ok(!/v4\.0\.47: auth cookie détecté/.test(ctrl),
        'per-cookie INFO log must be removed — it caused 334 lines in 3s (v4.1.2)');
    assert.ok(ctrl.includes('startCookieFlush'),
        'periodic flush must remain as persistence fallback (v4.1.2)');
});

test('v4.4.5: barre liste — badge UBtouch décoratif + accès Paramètres', async () => {
    const fs = await import('node:fs');
    const btn = fs.readFileSync(path.resolve(__dirname, '../public/reload-button.js'), 'utf-8');
    const sheet = fs.readFileSync(path.resolve(__dirname, '../public/settings-sheet.js'), 'utf-8');
    const i18n = fs.readFileSync(path.resolve(__dirname, '../src/i18n.mjs'), 'utf-8');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const preload = fs.readFileSync(path.resolve(__dirname, '../src/controller/preload.js'), 'utf-8');

    // Les 4 boutons partagent le MÊME style de base (même taille, bords arrondis).
    assert.ok(btn.includes('const BTN_STYLE'), 'shared button style (v4.1.3)');
    assert.ok(/border-radius:1[24]px/.test(btn), 'uniform rounded corners (v4.1.3/v4.1.8)');
    assert.ok(btn.includes("UBTOUCH_ID = 'utoutlook-ubtouch-badge'"), 'UBtouch decorative badge id (v4.1.3)');
    assert.ok(btn.includes('aria-hidden'), 'UBtouch badge hidden from assistive tech (v4.1.3)');
    assert.ok(btn.includes('UBTOUCH_SVG'), 'UBtouch round SVG logo (v4.1.3)');
    assert.ok(btn.includes("SETTINGS_ID = 'utoutlook-settings-btn'"), 'settings access id (v4.4.5)');
    assert.ok(btn.includes('window.__utoutlookOpenSettings'), 'bar opens the settings sheet (v4.4.5)');
    assert.ok(sheet.includes('window.electronAPI.firstInstall'), 'first-install moved to settings sheet (v4.4.5)');
    // Connectique : preload → IPC → handler principal
    assert.ok(preload.includes('firstInstall: () => ipcRenderer.invoke("first-install")'),
        'preload exposes firstInstall IPC (v4.1.3)');
    assert.ok(ctrl.includes('ipcMain.handle("first-install"'), 'main handles first-install IPC (v4.1.3)');
    assert.ok(ctrl.includes('settings.clear()'), 'first-install clears settings too (v4.1.3)');
    assert.ok(ctrl.includes('global.restartRequested = true'), 'first-install triggers wrapper relaunch (v4.1.3)');
    // i18n 8 langues
    for (const key of ['action.firstInstall', 'action.firstInstallConfirm', 'action.firstInstallNotify']) {
        assert.ok(i18n.includes(`'${key}':`), `i18n key ${key} (v4.1.3)`);
        const seg = i18n.slice(i18n.indexOf(`'${key}':`), i18n.indexOf(`'${key}':`) + 400);
        for (const lang of ['fr', 'en', 'es', 'de', 'it', 'pt', 'zh', 'ar', 'ca', 'eu']) {
            assert.ok(new RegExp(`\\b${lang}:`).test(seg), `${key} has ${lang} (v4.1.3)`);
        }
    }
});

test('v4.1.5: cocarde UBtouch officielle + icône deux doigts sur les boutons', async () => {
    const fs = await import('node:fs');
    const gestures = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');
    const btn = fs.readFileSync(path.resolve(__dirname, '../public/reload-button.js'), 'utf-8');
    // Nouveau dessin double-tap : DEUX DOIGTS (rects) + pastilles + chiffre 2.
    // v4.4.5: l'icone double-tap reste sur la page login ; la barre de liste
    // n'a plus qu'un acces Parametres (icone gear).
    for (const [name, src] of [['login', gestures]]) {
        assert.ok(src.includes('DOUBLE_TAP_ICON'), `${name}: icône double-tap définie (v4.1.5)`);
        assert.ok((src.match(/<rect x="5"/g) || []).length >= 1 &&
                  (src.match(/<rect x="17"/g) || []).length >= 1,
            `${name}: deux doigts stylisés (v4.1.7)`);
        assert.ok(src.includes('<circle cx="8" cy="15"') &&
                  src.includes('<circle cx="20" cy="15"'),
            `${name}: pastilles de contact sous les doigts (v4.1.7)`);
        assert.ok(!/stroke-linecap="round"/.test(src.slice(src.indexOf('DOUBLE_TAP_ICON'), src.indexOf('DOUBLE_TAP_ICON') + 600)),
            `${name}: plus de flèches « flamme » (v4.1.5)`);
    }
    // VRAIE cocarde Ubuntu Touch officielle (fond orange + path blanc 772 chars).
    assert.ok(btn.includes('viewBox="0 30 73 73"'), 'cocarde recadrée sur toute sa hauteur (v4.1.7)');
    assert.ok(btn.includes('M72.712 0H0v114.48h72.712z'), 'fond orange officiel (v4.1.5)');
    assert.ok(btn.includes('M16.625 80.772'), 'path blanc de la cocarde officielle (v4.1.5)');
    assert.ok(!/r="19" fill="none" stroke/.test(btn), 'plus de faux cercle approximatif (v4.1.5)');
    // Le texte vit dans un span dédié pour ne pas écraser l'icône.
    assert.ok(gestures.includes("label.className = 'ut-first-label'"),
        'login: span de texte dédié (v4.1.4)');
    const sheet = fs.readFileSync(path.resolve(__dirname, '../public/settings-sheet.js'), 'utf-8');
    assert.ok(sheet.includes('const reset = row(') && sheet.includes('reset.textContent ='),
        'liste: reset vit dans la feuille Parametres, sans icone a preserver (v4.4.5)');
    assert.ok(!btn.includes('ut-first-label'),
        'liste: plus de bouton first dans la barre (v4.4.5)');
});

test('v4.1.11: WD dérivé du vrai cwd (pwd -P), pas de la variable PWD périmée', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    assert.ok(cmd.includes('export WD="$(pwd -P 2>/dev/null || pwd)"'),
        'WD must use pwd -P builtin, not $PWD env (stale under Lomiri/setsid) (v4.1.11)');
    assert.ok(cmd.includes('*utoutlook.mathias*)') && cmd.includes('${_SRC%/bin/command.sh}'),
        'WD must have a fallback derived from $0 when cwd is not the click dir (v4.1.11)');
    assert.ok(!/export WD=\$\(pwd\)/.test(cmd),
        'plain $(pwd) without -P must not be used (v4.1.11)');
});

test('v4.2.3: identité fenêtre = état v4.0.98 (aucun --class / StartupWMClass)', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const desktop = fs.readFileSync(path.resolve(__dirname, '../../utoutlook.desktop'), 'utf-8');
    const bump = fs.readFileSync(path.resolve(__dirname, '../../../bump-version.sh'), 'utf-8');
    // Retour exact à v4.0.98 : pas de --class, pas de calcul d'identité.
    const cmdCode = cmd.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
    assert.ok(!/classoption|--class=/.test(cmdCode),
        'wrapper must NOT pass any --class to Electron: causes unknown.qtmir yellow icon (v4.2.3)');
    assert.ok(cmd.includes('prospect-mail "$dpioptions" "$sandboxoptions" "$gpuoptions" &'),
        'wrapper must keep the background launch (watchdog intact) (v4.2.3)');
    assert.ok(main.includes('app.setDesktopName("UToutlookmail")'),
        'setDesktopName must be the exact v4.0.98 value (v4.2.3)');
    assert.ok(!/^StartupWMClass=/m.test(desktop),
        'desktop must have NO StartupWMClass (v4.2.3)');
    assert.ok(!/^[^#]*sed -i[^\n]*StartupWMClass=/m.test(bump),
        'bump-version.sh must not reintroduce StartupWMClass (v4.2.3)');
});

test('v4.3.5: debounce rotation — capteur USB ne fait plus planter l app', async () => {
    const fs = await import('node:fs');
    const ctl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctl.includes('_pendingRotationKey !== keyOriented'),
        'rotation needs 3 consecutive ticks before triggering (v4.3.5)');
    assert.ok(ctl.includes('recentDisplayKeys.includes(keyOriented)) this._pendingRotationKey = null'),
        'transient orientation must be forgotten when returning to a known state (v4.3.5)');
});

test('v4.3.3: goodbye envoye par Electron au quit, pas par le wrapper', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    assert.ok(main.includes("execFile(`${process.env.WD}/bin/notify`, [t('shell.goodbye')]"),
        'Electron must send goodbye immediately on clean quit (v4.3.3)');
    assert.ok(!main.includes('import {execFile, execFileSync}'),
        'goodbye notification must NOT block the main thread / freeze the Quit button (v4.3.4)');
    assert.ok(!cmd.includes("utoutlook_notify \"$(utoutlook_t 'shell.goodbye')\""),
        'wrapper must not send goodbye (killed too late by Lomiri) (v4.3.3)');
});

test('v4.3.2: pas de bascule ni notification si deja software', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    assert.ok(cmd.includes('[ "${RENDER_MODE:-}" = "software" ]'),
        'must not flip when already software (v4.3.2)');
    assert.ok(cmd.includes('read -r cur < "${UTOUTLOOK_RENDER_MODE_FILE}"'),
        'must read render-mode with bash builtin, not external cat/tr (v4.3.2)');
});

test('v4.3.1: fausse rotation au demarrage ignoree + show apres roue', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const ctl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctl.includes('this.appStartedAt') && ctl.includes('Date.now() - this.appStartedAt < 15000'),
        'ignore false rotation during first 15s (v4.3.1)');
    assert.ok((cmd.match(/utoutlook_send_socket_cmd '\{"cmd":"show"\}'/g) || []).length >= 2,
        'send show after closing relaunch QML screen to restore Mir session (v4.3.1)');
});

test('v4.2.9: notification de demarrage apres 10 s si fenetre pas reellement affichee', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    const i18n = fs.readFileSync(path.resolve(__dirname, '../src/i18n.mjs'), 'utf-8');
    assert.ok(main.includes('win.isVisible() && win.isFocused()') &&
              main.includes('}, 10000)'),
        'startup notification must check the real window (visible AND focused) after 10s (v4.2.9)');
    assert.ok(!main.includes('mainWindowEverVisible || !process.env.WD'),
        'must NOT rely on mainWindowEverVisible which can lie when no Mir session (v4.2.9)');
    assert.ok(i18n.includes("UToutlook Mail démarre, veuillez patienter…"),
        'welcome message must tell the user the app is starting (v4.2.8)');
});

test('v4.2.7: pulses de focus au démarrage pour forcer la session Mir', async () => {
    const fs = await import('node:fs');
    const ctl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctl.includes('_surfaceHealthTicks'),
        'startup focus pulse counter must exist (v4.2.7)');
    assert.ok(ctl.includes('this.show()') && ctl.includes('startup focus pulse (force Mir session)'),
        'surface health poll must call show() to create the Mir session (v4.2.7)');
});

test('v4.2.5: quit propre détecté dès la 1re stagnation (avant SIGKILL Lomiri)', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    assert.ok(cmd.includes('utoutlook_exitclient_ours "${exitclient}"') &&
              cmd.includes('clean quit, wrapper exits now'),
        'wrapper must exit on first stagnation when exitclient is fresh and ours (v4.2.5)');
    assert.ok(cmd.includes('at ${stagnantCount}/2'),
        'early clean-quit check must be inside the stagnation branch (v4.2.5)');
});

test('v4.2.4: barre QML de démarrage désactivée — anti unknown.qtmir (icône jaune)', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    assert.ok(cmd.includes('export UTOUTLOOK_DISABLE_STARTUP_QML=1'),
        'startup QML bar must be disabled (v4.2.4)');
    assert.ok(common.includes('UTOUTLOOK_DISABLE_STARTUP_QML:-0') &&
              common.includes('return 0'),
        'utoutlook_set_start_step must skip QML window when disabled (v4.2.4)');
});

test('v3.3.22: uncaughtException ne tue plus l\'app au premier coup (exit seulement après 5 en 60s)', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    const i = main.indexOf("process.on('uncaughtException'");
    const seg = main.slice(i, i + 900);
    assert.ok(seg.includes('uncaughtCount >= 5'), 'exit only after 5 uncaught exceptions in 60s (v3.3.22)');
    assert.ok(!/\(\) => app\.exit\(1\)/.test(seg), 'no immediate app.exit(1) on first exception (v3.3.22)');
});

test('v3.3.23: cacheWatcher a un handler error (CACHE_DIR supprimé ne doit pas crasher)', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const i = ctrl.indexOf('startCacheWatcher()');
    const seg = ctrl.slice(i, i + 1600);
    assert.ok(seg.includes("cacheWatcher.on('error'"), 'fs.watch must have an error handler (v3.3.23)');
});

test('v3.3.24: le scan périodique gestures ne parcourt plus tout document.body (perf)', async () => {
    const fs = await import('node:fs');
    const g = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');
    const i = g.indexOf('setInterval(() => {');
    const seg = g.slice(i, i + 400);
    assert.ok(!seg.includes('hideLoadingIndicators(document.body)'),
        'periodic scan must not walk the whole body (v3.3.24)');
    assert.ok(seg.includes('hideLoadingIndicators(container)'),
        'periodic scan must target list containers only (v3.3.24)');
});

test('v3.3.25: UX top3 — swipe actions, empty state i18n, compteur volet fermé, reading font scale', async () => {
    const fs = await import('node:fs');
    const g = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');
    assert.ok(g.includes('swipe LEFT = delete') && g.includes("action === 'delete'"),
        'swipe actions on list items required (v3.3.25)');
    assert.ok(g.includes('utoutlook-empty-state') && g.includes('emptyTitle'),
        'empty state with i18n required (v3.3.25)');

    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    // v4.0.123: I'ancien toggle v3.3.25 a été SUPPRIMÉ — il rouvrait le menu
    // périodiquement. Le compteur n'est plus lu volet fermé.
    assert.ok(!obs.includes('navToggleForRead'),
        'observer must NOT toggle the nav pane to read the count (removed v4.0.123)');

    const i18n = fs.readFileSync(path.resolve(__dirname, '../src/i18n.mjs'), 'utf-8');
    assert.ok(i18n.includes("'empty.title'") && i18n.includes("'empty.body'"),
        'empty state keys must exist in all languages (v3.3.25)');

    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctrl.includes('READING_FONT_STEPS') && ctrl.includes('readingFontScale'),
        'reading font scale command required (v3.3.25)');
    const sock = fs.readFileSync(path.resolve(__dirname, '../src/ipc-socket.mjs'), 'utf-8');
    assert.ok(sock.includes("case 'readingFont'"), 'socket cmd readingFont required (v3.3.25)');
});

test('v3.3.26: icône mascotte — enveloppe + tête UBTouch, statique + animée, splash animé', async () => {
    const fs = await import('node:fs');
    const assets = path.resolve(__dirname, '../../assets');
    for (const f of ['logo-vibe.svg', 'logo-anim.svg', 'logo.png', 'mascotte-512.png']) {
        assert.ok(fs.existsSync(path.join(assets, f)), `asset ${f} must exist (v3.3.26)`);
    }
    const vibe = fs.readFileSync(path.join(assets, 'logo-vibe.svg'), 'utf-8');
    // v3.3.62: mascotte redessinée en vectoriel pur (plus de PNG embarqué en base64)
    assert.ok(vibe.includes('<svg') && vibe.includes('#E95420'),
        'logo-vibe.svg = enveloppe + tête mascotte vectorielle sur fond orange UT (v3.3.26/v3.3.62)');
    const anim = fs.readFileSync(path.join(assets, 'logo-anim.svg'), 'utf-8');
    assert.ok(anim.includes('animateTransform') && anim.includes('<svg'),
        'logo-anim.svg = tête qui entre/sort de l\'enveloppe en boucle, vectoriel (v3.3.26/v3.3.62)');
    const splash = fs.readFileSync(path.resolve(__dirname, '../public/splash.html'), 'utf-8');
    assert.ok(splash.includes('logo-anim.svg'), 'splash must use the animated logo (v3.3.26)');
});

test('v3.3.29: les logos référencés depuis l\'asar (splash/about) existent DANS l\'asar', async () => {
    const fs = await import('node:fs');
    // inner assets dir = utoutlookmail/assets → packed into app.asar (files: assets/**)
    // splash.html (public/) references ../assets/logo-anim.svg, about.html (src/)
    // references ../assets/logo-vibe.svg — both resolve INSIDE the asar at runtime.
    // v3.3.28 bug: the new mascot logos were only in the outer click assets/ dir,
    // so the splash showed a broken-image icon.
    const inner = path.resolve(__dirname, '../assets');
    for (const f of ['logo-anim.svg', 'logo-vibe.svg']) {
        assert.ok(fs.existsSync(path.join(inner, f)), `inner asar asset ${f} must exist (v3.3.29)`);
    }
    const anim = fs.readFileSync(path.join(inner, 'logo-anim.svg'), 'utf-8');
    // v3.3.62: mascotte vectorielle pure (animateTransform + <svg>, plus de base64)
    assert.ok(anim.includes('animateTransform') && anim.includes('<svg'),
        'inner logo-anim.svg must be the self-contained animated vector mascot version (v3.3.29/v3.3.62)');
    const vibe = fs.readFileSync(path.join(inner, 'logo-vibe.svg'), 'utf-8');
    assert.ok(vibe.includes('<svg') && vibe.includes('#E95420'),
        'inner logo-vibe.svg must be the self-contained vector mascot version, not the old 2 KB one (v3.3.29/v3.3.62)');
    // every ../assets/... reference in asar-packed pages must resolve in the inner dir
    for (const page of ['../public/splash.html', '../src/about.html']) {
        const html = fs.readFileSync(path.resolve(__dirname, page), 'utf-8');
        for (const m of html.matchAll(/\.\.\/assets\/([\w@.-]+)/g)) {
            assert.ok(fs.existsSync(path.join(inner, m[1])),
                `${page} references ../assets/${m[1]} which must exist in the asar assets (v3.3.29)`);
        }
    }
});

test('v3.3.27: XMODIFIERS=@im=maliit exporté pour que le clavier virtuel tape dans Chromium', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    assert.ok(cmd.includes('export XMODIFIERS=@im=maliit'),
        'command.sh must export XMODIFIERS=@im=maliit so Maliit delivers keys to Chromium (v3.3.27)');
});

test('v3.3.28: clean quit writes exitclient synchronously so the wrapper does NOT relaunch after swipe-close', async () => {
    const fs = await import('node:fs');
    const cfg = fs.readFileSync(path.resolve(__dirname, '../src/config.mjs'), 'utf-8');
    // markCleanExit writes the flag synchronously (async writeFile raced app.exit and never landed)
    assert.ok(cfg.includes('export function markCleanExit()'), 'markCleanExit() must exist in config.mjs (v3.3.28)');
    assert.ok(cfg.includes('fs.writeFileSync(EXIT_CLIENT_FILE'),
        'markCleanExit must write exitclient with writeFileSync (v3.3.28)');

    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    // window-all-closed (swipe-close path) must mark the clean exit
    const wac = main.slice(main.indexOf('window-all-closed'), main.indexOf('window-all-closed') + 300);
    assert.ok(wac.includes('markCleanExit()'), 'window-all-closed must call markCleanExit (v3.3.28)');
    // cleanupAndExit (SIGTERM/socket quit path) must mark the clean exit too
    const cae = main.slice(main.indexOf('async cleanupAndExit'), main.indexOf('async cleanupAndExit') + 3000);
    assert.ok(cae.includes('markCleanExit()'), 'cleanupAndExit must call markCleanExit (v3.3.28)');
    // startup-failure auto-exit must NOT set the clean-quit flag (wrapper must relaunch instead)
    const autoExit = main.slice(main.indexOf('!windowEverVisible && heartbeatSeconds > 60'));
    const autoExitBlock = autoExit.slice(0, autoExit.indexOf('app.exit(0)'));
    assert.ok(!autoExitBlock.includes('EXIT_CLIENT_FILE'),
        'startup-failure auto-exit must not write EXIT_CLIENT_FILE (v3.3.28)');

    // the window 'close' handler is the earliest reliable point on a
    // swipe-close (Mir session stop can kill the process before 'closed') —
    // it must write the flag synchronously while letting the window close
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const closeHandler = ctrl.slice(ctrl.indexOf('"close", (e)'), ctrl.indexOf('"close", (e)') + 2600);
    assert.ok(closeHandler.includes('markCleanExit()') && closeHandler.includes('letting it close'),
        'window close handler must call markCleanExit before letting it close (v3.3.28)');
    // the 'closed' handler (app.exit there fires before window-all-closed) must mark too
    const closed = ctrl.slice(ctrl.indexOf('preventAutoCloseApp'), ctrl.indexOf('preventAutoCloseApp') + 900);
    assert.ok(closed.includes('markCleanExit()'), 'window closed handler must call markCleanExit before app.exit (v3.3.28)');
    // restart paths (settings import/reset) must NOT mark a clean quit
    const tray = fs.readFileSync(path.resolve(__dirname, '../src/controller/tray-controller.mjs'), 'utf-8');
    assert.ok(tray.includes('global.restartRequested = true'),
        'tray relaunch paths must set restartRequested so the wrapper relaunches (v3.3.28)');
    assert.ok(main.includes('if (!global.restartRequested && !global.skipCleanExitFlag) markCleanExit()'),
        'cleanupAndExit must skip markCleanExit on restart (v3.3.28) and on rotation relaunch (v4.0.84, skipCleanExitFlag)');

    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    // wrapper: on heartbeat stagnation, a FRESH clean-quit flag means exit, not
    // relaunch (v4.0.10: freshness guard so a stale flag from a pre-3.0 version
    // cannot kill the new instance — upgrade bug "stuck on splash")
    const stag = cmd.slice(cmd.indexOf('stagnantCount} -ge 2'), cmd.indexOf('stagnantCount} -ge 2') + 1400);
    assert.ok(stag.includes('utoutlook_flag_fresh "${exitclient}"') && stag.includes('utoutlook_exitclient_ours') && stag.includes('exit 0'),
        'command.sh must exit (not relaunch) when a FRESH exitclient written by OUR client exists at heartbeat stagnation (v3.3.28 + v4.0.10 + v4.0.13)');
    // wrapper: stale lifecycle flags must be cleared in cleanup() AFTER the
    // old app is killed (not while the client is alive — the 'close' event
    // writes exitclient right before the process dies)
    const cleanup = cmd.slice(cmd.indexOf('function cleanup()'), cmd.indexOf('function launch_prospect'));
    assert.ok(cleanup.includes('rm -f "${UTOUTLOOK_EXITCLIENT}" "${UTOUTLOOK_KILLEDCLIENT}"'),
        'command.sh cleanup() must clear exitclient/killedclient after kill_app (v3.3.28)');
    const aliveBranch = cmd.slice(cmd.indexOf('clientalive=1'), cmd.indexOf('clientalive=1') + 200);
    assert.ok(!aliveBranch.includes('rm -f'), 'alive branch must NOT delete lifecycle flags (v3.3.28)');
});

test('v3.3.30: démarrage rapide + wrapper périmé silencieux (pas de kill du nouvel app)', async () => {
    const fs = await import('node:fs');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    // kill_app: fast path — if no prospect-mail is running, return BEFORE the
    // close-flag write + 3s sleep (cleanup calls it 3x per start = 9s lost)
    const killApp = common.slice(common.indexOf('utoutlook_kill_app()'), common.indexOf('utoutlook_cleanup_locks()'));
    const checkPos = killApp.indexOf('if ! utoutlook_prospect_running; then');
    const flagPos = killApp.indexOf('echo "closed:${UTOUTLOOK_WRAPPER_PID:-unknown}" > "${UTOUTLOOK_EXITCOMMAND}"');
    assert.ok(checkPos !== -1 && flagPos !== -1 && checkPos < flagPos,
        'kill_app must check live processes (zombies ignored) BEFORE writing the close flag / sleeping (v3.3.30/v4.1.0)');
    // kill_stale_wrappers: SIGKILL only, never SIGTERM (a TERM runs the EXIT trap
    // which writes the close flag / socket quit and can kill the NEW instance)
    const ksw = common.slice(common.indexOf('utoutlook_kill_stale_wrappers()'), common.indexOf('utoutlook_flag_fresh()'));
    assert.ok(!ksw.includes('kill -TERM'), 'kill_stale_wrappers must not SIGTERM stale wrappers (v3.3.30)');
    assert.ok(ksw.includes('kill -9'), 'kill_stale_wrappers must SIGKILL stale wrappers (v3.3.30)');

    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    // close_command: stale wrapper (pidfile != $$) exits silently
    const cc = cmd.slice(cmd.indexOf('function close_command()'), cmd.indexOf('function close_command()') + 700);
    assert.ok(cc.includes('wrapper.pid') && cc.includes('exit 0') && cc.includes('curpid'),
        'close_command must exit silently when pidfile != $$ (v3.3.30)');
    // cleanup: pid is recorded BEFORE kill_stale_wrappers so the stale wrapper
    // sees it is no longer the owner
    const cu = cmd.slice(cmd.indexOf('function cleanup()'), cmd.indexOf('function launch_prospect'));
    const pidPos = cu.indexOf('echo $$ > "${_pf}"');
    const kswPos = cu.indexOf('utoutlook_kill_stale_wrappers');
    assert.ok(pidPos !== -1 && kswPos !== -1 && pidPos < kswPos,
        'cleanup must claim/verify wrapper.pid BEFORE kill_stale_wrappers (v3.3.30/v4.1.0)');
});

test('v4.0.10: upgrade depuis une version < 3.0 — plus de démarrage bloqué sur le splash', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');

    // wrapper: a freshness marker is created once at init and refreshed in
    // cleanup() after the old app is killed
    assert.ok(cmd.includes('UTOUTLOOK_WRAPPER_MARKER') && cmd.includes(': > "${UTOUTLOOK_WRAPPER_MARKER}"'),
        'command.sh must create the wrapper-start freshness marker at init (v4.0.10)');
    const cu = cmd.slice(cmd.indexOf('function cleanup()'), cmd.indexOf('function launch_prospect'));
    assert.ok(cu.includes('UTOUTLOOK_WRAPPER_MARKER'),
        'cleanup() must refresh the freshness marker after clearing lifecycle flags (v4.0.10)');
    // common.sh: helper using the bash builtin [ -nt ] (no external binary — AppArmor)
    assert.ok(common.includes('utoutlook_flag_fresh()') && common.includes('-nt "${UTOUTLOOK_WRAPPER_MARKER}"'),
        'common.sh must provide utoutlook_flag_fresh() based on [ -nt ] (v4.0.10)');
    // wrapper: killedclient relaunch and exitclient exit are freshness-guarded
    const alive = cmd.slice(cmd.indexOf('utoutlook_flag_fresh "${killedclient}"'), cmd.indexOf('utoutlook_flag_fresh "${killedclient}"') + 400);
    assert.ok(alive.includes('utoutlook_flag_fresh "${exitclient}"'),
        'killedclient/exitclient branches must be freshness-guarded (v4.0.10)');

    // settings: a startMinimized=true persisted by a pre-3.0 settings.json is forced off
    const settingsSrc = fs.readFileSync(path.resolve(__dirname, '../src/settings.mjs'), 'utf-8');
    assert.ok(settingsSrc.includes("settings.set('startMinimized', false)"),
        'settings.mjs must force startMinimized=false at load (v4.0.10, stale pre-3.0 value)');

    // splash: first close ALWAYS shows the main window (no startMinimized veto),
    // and closes on main-frame did-fail-load + render-process-gone
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const closeSplash = ctrl.slice(ctrl.indexOf('closeSplashWindow() {'), ctrl.indexOf('closeSplashWindow() {') + 1600);
    assert.ok(!closeSplash.includes('!this.initialMinimization.domReady'),
        'closeSplashWindow must always show the main window on first close (v4.0.10)');
    assert.ok(ctrl.includes("'render-process-gone'") && ctrl.includes('isMainFrame) this.closeSplashWindow()'),
        'splash must close on main-frame did-fail-load and render-process-gone (v4.0.10)');
});

test('v3.3.45: retour au Wayland natif (Lomiri) — plus de forçage X11, le clavier Maliit passe par text-input (champs password inclus, comme en 3.2.x)', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    // WAYLAND_DISPLAY must NOT be unset anymore: Electron runs as a native
    // Wayland client and the OSK uses the Wayland text-input protocol
    assert.ok(!/^\s*unset WAYLAND_DISPLAY/m.test(cmd),
        'command.sh must NOT unset WAYLAND_DISPLAY anymore (v3.3.45, native Wayland)');
    assert.ok(!cmd.includes('--ozone-platform=x11'),
        'command.sh must NOT pass --ozone-platform=x11 anymore (v3.3.45)');
    // XMODIFIERS kept for the X11/XWayland fallback path
    assert.ok(cmd.includes('XMODIFIERS=@im=maliit'),
        'command.sh must keep XMODIFIERS=@im=maliit as X11 fallback (v3.3.45)');

    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    assert.ok(!main.includes("appendSwitch('ozone-platform', 'x11')"),
        'main.mjs must NOT appendSwitch ozone-platform=x11 anymore (v3.3.45, native Wayland)');
});

test('v3.3.32: repaint forcé au réveil (veille → écran blanc en X11) + pas de background throttling', async () => {
    const fs = await import('node:fs');
    const m = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(m.includes('powerMonitor') && m.includes("this._on(powerMonitor, 'resume'"),
        'must listen to powerMonitor resume (v3.3.32)');
    assert.ok(m.includes('webContents.invalidate()'),
        'must call webContents.invalidate() to force repaint after wake (v3.3.32)');
    assert.ok(m.includes('setBackgroundThrottling(false)'),
        'must disable background throttling so the X11 window repaints after wake (v3.3.32)');
});

test('v3.3.60: champ password converti IN PLACE (type=text masqué, jamais caché) — contournement du flag HAS_BEEN_PASSWORD (Chromium 142+)', async () => {
    const fs = await import('node:fs');
    const g = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');
    // v3.3.49 avait supprimé le swap overlay (cassait focus/insertText), mais
    // v3.3.60 a RÉINTRODUIT la conversion in place : Chromium 142+ bloque les
    // commits IME après focus d'un champ password (HAS_BEEN_PASSWORD) — on
    // convertit le champ en type=text masqué AVANT le focus, sans jamais le
    // cacher (display:none casserait le focus programmatique).
    assert.ok(g.includes('demaskPw') && g.includes('PW_MASK_ATTR'),
        'gestures.js must convert password fields IN PLACE via demaskPw (v3.3.60, HAS_BEEN_PASSWORD)');
    assert.ok(!g.includes('pwSwap ='),
        'gestures.js must NOT use the old pwSwap overlay (v3.3.49, cassait le focus)');
    assert.ok(g.includes('SIGNIN_OPTIONS_RE'),
        'gestures.js must still hide the "Sign-in options" button (v3.3.42+)');
});

test('v3.3.50: badge logo + « Made for Ubtouch » injecté sur la page de login Microsoft (i18n 8 langues)', async () => {
    const fs = await import('node:fs');
    const g = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');
    assert.ok(g.includes('utoutlook-login-badge') && g.includes('LOGO_DATA_URI') && g.includes('microsoftonline'),
        'gestures.js must inject the login badge (logo + label) on Microsoft login pages (v3.3.50)');
    const i18n = fs.readFileSync(path.resolve(__dirname, '../src/i18n.mjs'), 'utf-8');
    assert.ok(i18n.includes("'login.madeFor'"),
        'i18n.mjs must define login.madeFor (v3.3.50)');
    for (const lang of ['fr','en','es','de','it','pt','zh','ar','ca','eu']) {
        const block = i18n.slice(i18n.indexOf("'login.madeFor'"), i18n.indexOf("'login.madeFor'") + 400);
        assert.ok(block.includes(lang + ':'),
            `login.madeFor must exist for ${lang} (v3.3.50)`);
    }
});

// ============================================================
// Tests for v4.0.3 — real in-app server reachability test.
// The old network test no longer worked because it relied only on
// did-fail-load (fires on navigations only) and navigator.onLine
// (stays true in Electron/Ubuntu Touch even without connectivity).
// v4.0.3 adds checkServerReachable() (real HTTP request with timeout),
// a periodic server monitor, and a "server not responding" overlay.
// ============================================================

test('v4.0.3: checkServerReachable performs a REAL HTTP request with timeout (net.fetch + AbortController)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('async checkServerReachable()'),
        'controller must define checkServerReachable() (v4.0.3)');
    const start = content.indexOf('async checkServerReachable()');
    const end = content.indexOf('startServerMonitor()', start);
    const body = content.slice(start, end);
    assert.ok(body.includes('net.fetch'), 'checkServerReachable must use net.fetch (real request, v4.0.3)');
    assert.ok(body.includes('AbortController') && body.includes('abort()'),
        'checkServerReachable must use AbortController timeout (v4.0.3)');
    assert.ok(body.includes('mainMailServiceUrl'),
        'checkServerReachable must target the configured mail/login server URL (v4.0.3)');
});

test('v4.0.3: connectivity monitor uses the real server check, not navigator.onLine', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    const monStart = content.indexOf('startConnectivityMonitor()');
    const monEnd = content.indexOf('// --- Server reachability test', monStart);
    const monBody = content.slice(monStart, monEnd);
    assert.ok(monBody.includes('checkServerReachable()'),
        'connectivity monitor must call checkServerReachable() (v4.0.3)');
    assert.ok(!monBody.includes("executeJavaScript('navigator.onLine')"),
        'connectivity monitor must NOT poll navigator.onLine via executeJavaScript (v4.0.3)');
});

test('v4.0.3: periodic server monitor shows "server not responding" overlay after consecutive failures', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');
    assert.ok(content.includes('startServerMonitor()'),
        'controller must define startServerMonitor() (v4.0.3)');
    assert.ok(content.includes("showOfflineOverlay('server')"),
        'server monitor must show the server-specific overlay (v4.0.3)');
    assert.ok(content.includes("'server.title'") && content.includes("'server.message'"),
        'overlay must support server.title / server.message keys (v4.0.3)');
    // did-fail-load must distinguish offline vs server via an immediate check
    const offlineStart = content.indexOf('setupOfflineDetection()');
    const offlineEnd = content.indexOf('showOfflineOverlay(', offlineStart);
    const offlineBody = content.slice(offlineStart, offlineEnd);
    assert.ok(offlineBody.includes('checkServerReachable()'),
        'did-fail-load handler must run an immediate server check to pick the right overlay (v4.0.3)');
});

test('v4.0.3: i18n has server.* and notif.server* keys in all 10 languages', async () => {
    const {t, setLanguage, getAvailableLanguages} = await import('../src/i18n.mjs');
    const keys = ['server.title', 'server.message', 'notif.serverUnreachable.title', 'notif.serverReachable.title'];
    for (const lang of Object.keys(getAvailableLanguages())) {
        setLanguage(lang);
        for (const key of keys) {
            const translated = t(key);
            assert.ok(translated !== key, `Missing ${key} for ${lang} (v4.0.3)`);
            assert.ok(translated.length > 0, `Empty ${key} for ${lang} (v4.0.3)`);
        }
    }
});

// v4.3.7: garde-fou i18n — les 10 langues (dont ca/eu) doivent avoir le même
// nombre de clés traduites. Le vieux test ne parlait que de 8 langues.
test('v4.3.7: i18n coverage is complete in all 10 languages', async () => {
    const {getAvailableLanguages, getTranslationCoverage} = await import('../src/i18n.mjs');
    const langs = Object.keys(getAvailableLanguages());
    assert.strictEqual(langs.length, 10, 'exactly 10 languages must be registered');
    assert.deepStrictEqual(
        langs.slice().sort(),
        ['ar', 'ca', 'de', 'en', 'es', 'eu', 'fr', 'it', 'pt', 'zh'],
        'catalan (ca) and basque (eu) must be present (v4.3.0)'
    );
    const coverage = getTranslationCoverage();
    const reference = coverage.fr;
    assert.ok(reference > 0, 'French catalogue must not be empty');
    for (const lang of langs) {
        assert.strictEqual(coverage[lang], reference,
            `${lang} has ${coverage[lang]}/${reference} translated keys — incomplete catalogue`);
    }
});

// ============================================================
// Tests for v4.0.95 — bouton « Recharger les messages »
// ============================================================

test('v4.0.95: bouton « Recharger les messages » injecté, câblé IPC et i18n 8 langues', async () => {
    const fs = await import('node:fs');
    const publicDir = path.resolve(__dirname, '../public');
    const srcDir = path.resolve(__dirname, '../src');
    const button = fs.readFileSync(path.join(publicDir, 'reload-button.js'), 'utf-8');
    const preload = fs.readFileSync(path.join(srcDir, 'controller/preload.js'), 'utf-8');
    const controller = fs.readFileSync(path.join(srcDir, 'controller/mail-window-controller.mjs'), 'utf-8');
    const i18n = fs.readFileSync(path.join(srcDir, 'i18n.mjs'), 'utf-8');

    // Le script injecté appelle l'API preload, avec repli location.reload().
    assert.ok(button.includes('window.electronAPI.reloadMessages'),
        'reload-button.js must call electronAPI.reloadMessages (v4.0.95)');
    assert.ok(button.includes('location.reload'),
        'reload-button.js must fall back to location.reload (v4.0.95)');
    assert.ok(button.includes('MAIL_URL.test(location.href)') && button.includes('onMailPage()'),
        'reload-button.js must gate visibility on the Outlook mail URL (v4.0.95)');
    assert.ok(button.includes("window.addEventListener('click'") && button.includes('}, true)'),
        'reload-button.js must catch clicks in capture phase (v4.0.95)');
    assert.ok(button.includes("tr('reloading'") && button.includes('setTimeout(() => { location.reload(); }, 2000)'),
        'reload button must give immediate feedback and force a renderer-side reload fallback (v4.0.95)');
    const sheet = fs.readFileSync(path.join(publicDir, 'settings-sheet.js'), 'utf-8');
    assert.ok(sheet.includes('window.electronAPI.quitApp') && sheet.includes("tr('commonQuit'"),
        'Quit moved to the settings sheet (v4.4.5)');
    assert.ok(button.includes('window.__utoutlookOpenSettings') && button.includes('SETTINGS_ID'),
        'the bar only exposes the settings entry (v4.4.5)');
    assert.ok(button.includes('unhideList') && button.includes("h + 'px'"),
        'action bar must keep list unhidden after SPA re-renders (v4.0.98)');
    assert.ok(button.includes('a !== ml && a !== document.body') &&
              controller.includes('a !== ml && a !== document.body'),
        'MessageList itself must never get a frozen px height (v4.0.101)');
    assert.ok(!controller.includes("msgList.style.width = '40%'"),
        'landscape must not shrink the message list to 40% width (v4.0.102)');
    assert.ok(button.includes('listReady') && button.includes('bar.style.display'),
        'action buttons must show only when the message list is loaded (v4.0.103)');
    assert.ok(button.includes("'pointer-events', 'auto'") && controller.includes("'pointer-events', 'auto'"),
        'message rows must accept clicks again (v4.0.104)');

    // Le preload expose l'API et envoie le bon canal IPC.
    assert.ok(preload.includes('reloadMessages'),
        'preload must expose reloadMessages (v4.0.95)');
    assert.ok(preload.includes('"reload-messages"'),
        'preload must send the reload-messages IPC (v4.0.95)');

    // Le contrôleur écoute le canal, injecte le bouton et recharge réellement.
    assert.ok(controller.includes('this._on(ipcMain, "reload-messages"'),
        'main process must handle reload-messages (v4.0.95)');
    assert.ok(controller.includes('injectReloadButton'),
        'controller must inject the reload button (v4.0.95)');
    const methodBody = (name, next) => {
        const start = controller.indexOf(`${name}(`);
        assert.ok(start >= 0, `missing ${name} (v4.0.95)`);
        const end = controller.indexOf(next, start);
        return controller.slice(start, end > 0 ? end : controller.length);
    };
    const manual = methodBody('async manualReloadMessages', '\n    /**');
    assert.ok(manual.includes('webContents.reload()'),
        'manual reload must reload the page (v4.0.95)');
    assert.ok(manual.includes('manualReloadInProgress'),
        'manual reload must be reentrancy-guarded (v4.0.95)');
    assert.ok(!manual.includes('listEmptyCount >='),
        'manual reload must NOT depend on the empty-list watchdog (v4.0.95)');
    assert.ok(manual.includes('autoReloadBlockedUntil'),
        'manual reload must block auto reloads via the dedicated flag (v4.0.95)');
    assert.ok(!manual.includes('lastRotationReload'),
        'manual reload must NOT touch lastRotationReload (rotation detector) (v4.0.95)');

    const repaintStart = controller.indexOf('    forceListRepaint(tag) {');
    assert.ok(repaintStart >= 0, 'missing forceListRepaint (v4.0.95)');
    const repaint = controller.slice(repaintStart, controller.indexOf('\n    /**', repaintStart));
    assert.ok(repaint.includes('this.autoReloadBlockedUntil'),
        'forceListRepaint last-resort must honor the dedicated block flag (v4.0.95)');
    assert.ok(!repaint.includes('.click()'),
        'forceListRepaint must not click nav/back toggles (list vanishes in landscape) (v4.0.96)');
    assert.ok(repaint.includes('hors du template literal injecté'),
        'last-resort reload must run in main process, not in the injected script (v4.0.97)');

    const observer = methodBody('async addUnreadNumberObserver', '\n    injectGestures(');
    assert.ok(observer.includes('Object.assign(window.__utoutlookI18n||{}'),
        'observer re-injection must merge i18n, not wipe the reload button label (v4.0.95)');

    // i18n : les deux clés doivent exister dans les 8 langues.
    for (const key of ['overlay.reloadMessages', 'overlay.reloading']) {
        const start = i18n.indexOf(`'${key}'`);
        assert.ok(start >= 0, `missing i18n key ${key} (v4.0.95)`);
        const block = i18n.slice(start, i18n.indexOf('},', start));
        for (const lang of ['fr', 'en', 'es', 'de', 'it', 'pt', 'zh', 'ar', 'ca', 'eu']) {
            assert.ok(block.includes(`${lang}:`), `i18n ${key} missing ${lang} (v4.0.95)`);
        }
    }
});

test('v4.0.99: roue de relance réactivée + zombies du wrapper récupérés', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    // Le flag de rotation doit être réécrit par Electron (plus de quit au pivot).
    assert.ok(ctrl.includes('fs.writeFileSync(ROTATION_RELAUNCH_FILE'),
        'controller must write the rotation flag for the wrapper (v4.0.99)');
    // v4.3.6: la roue n'est PLUS affichée sur simple rotation (app vivante) —
    // elle volait la session Mir et cassait l'observer (No inbox element found).
    assert.ok(!cmd.includes('rotation relaunch screen shown (app still alive'),
        'wrapper must NOT show the wheel when app is alive on rotation (v4.3.6)');
    assert.ok(cmd.includes('if [ -f "${rotationflag}" ]; then'),
        'wrapper must still clear the rotation flag (v4.3.6)');
    // wait après chaque kill de child (CLIENT_PID, QML_PID, RELAUNCH_QML_PID).
    assert.ok((cmd.match(/wait "\$\{CLIENT_PID\}"/g) || []).length >= 1,
        'wrapper must wait() its client child after SIGKILL (v4.0.99)');
    assert.ok((cmd.match(/wait "\$\{QML_PID\}"/g) || []).length >= 1,
        'wrapper must wait() its qmlscene child after SIGKILL (v4.0.99)');
    assert.ok((cmd.match(/wait "\$\{RELAUNCH_QML_PID\}"/g) || []).length >= 2,
        'wrapper must wait() the relaunch wheel after both kill paths (v4.0.99)');

    const splash = fs.readFileSync(path.resolve(__dirname, '../../qml/startup.qml'), 'utf-8');
    assert.ok(splash.includes('NumberAnimation') && splash.includes('#E95420'),
        'startup.qml must show an animated orange progress bar (v4.0.105)');
    assert.ok(cmd.includes('UTOUTLOOK_STARTUP_QML') && cmd.includes('STARTUP_QML_PID'),
        'wrapper must launch and close the generated startup progress screen (v4.0.105/v4.1.0)');
});

test('v4.0.107: wrapper — plus de /usr/bin/date (AppArmor) + scaling jamais 0.00', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');

    // /usr/bin/date est bloqué par AppArmor → la boucle spammait "Permission denied"
    // et RELAUNCH_QML_SHOWN_AT restait vide.
    assert.ok(!cmd.includes('$(date +%s)'),
        'wrapper must not call /usr/bin/date (AppArmor denies it) (v4.0.107)');
    assert.ok(cmd.includes('EPOCHSECONDS'),
        'wrapper must use the bash EPOCHSECONDS builtin instead (v4.0.107)');

    // get-scale.sh peut renvoyer 0 → scaling "0.00" → UI minuscule.
    assert.ok(cmd.includes('appScaling=115'),
        'wrapper must fall back to a valid scale instead of 0.00 (v4.0.107)');
    assert.ok(!cmd.includes('0.00'),
        'wrapper must never compute a 0.00 device scale factor (v4.0.107)');
});

test('v4.0.109: paysage — ne pas gonfler ni masquer les blocs de la liste', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(path.resolve(__dirname, '../public/main.css'), 'utf-8');
    const gestures = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');

    assert.ok(css.includes(':not(:has([role="option"]))') && css.includes('min-height: 0 !important'),
        'structural blocks of the message list must not get the row min-height (v4.0.109)');
    assert.ok(gestures.includes("c.querySelector('[role=\"listbox\"]"),
        'hideMessageListBottomBar must not hide the block containing the messages (v4.0.109)');
});

test('v4.0.110: startup.qml — animation ciblée et largeur constante', async () => {
    const fs = await import('node:fs');
    const qml = fs.readFileSync(path.resolve(__dirname, '../../qml/startup.qml'), 'utf-8');
    const deploy = fs.readFileSync(path.resolve(__dirname, '../../../build-deploy.sh'), 'utf-8');

    assert.ok(qml.includes('target: bar') && qml.includes('property: "width"'),
        'startup bar must use an explicit targeted animation (v4.0.110)');
    assert.ok(qml.includes('to: 592') && qml.includes('width: 600'),
        'startup bar must use constant sizes, not a window-relative binding (v4.0.110)');
    assert.ok(deploy.includes("-name '*.click' -delete"),
        'build-deploy must remove old click artifacts before building (v4.0.110)');
});

test('v4.0.111: roue de relance — watchdog 20s même si le ping échoue', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    assert.ok(cmd.includes('watchdog timeout (20s)') && cmd.includes('-ge 20'),
        'relaunch wheel must have an unconditional 20s timeout (v4.0.111)');
});

test('v4.0.112: roue de relance — dégradé vert vers orange', async () => {
    const fs = await import('node:fs');
    const qml = fs.readFileSync(path.resolve(__dirname, '../../qml/relaunch.qml'), 'utf-8');
    assert.ok(qml.includes('var green = [61, 220, 132]') && qml.includes('var orange = [233, 84, 32]'),
        'relaunch wheel must interpolate green to orange (v4.0.112)');
    assert.ok(qml.includes('for (var i = 0; i < segments; i++)'),
        'relaunch wheel must draw a gradient arc in segments (v4.0.112)');
});

test('v4.0.113: repaints — ne plus basculer le volet de navigation', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    assert.ok(!ctrl.includes("navPane.style.display = 'none'"),
        'repaints must not hide the navigation pane (v4.0.113)');
    assert.ok(!ctrl.includes("navPane.style.removeProperty('display')"),
        'repaints must not re-show the navigation pane (v4.0.113)');
    assert.ok(!ctrl.includes("classList.toggle('utoutlook-hide-nav'") && !ctrl.includes("classList.remove('utoutlook-hide-nav'"),
        'layout fix must not auto-toggle the nav mask (v4.0.113)');
});

test('v4.0.114/115: volet masqué reste masqué, seul un clic peut le rouvrir', async () => {
    const fs = await import('node:fs');
    const button = fs.readFileSync(path.resolve(__dirname, '../public/reload-button.js'), 'utf-8');
    const controller = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(button.includes("localStorage.getItem(NAV_KEY)") && button.includes('utoutlook-show-nav'),
        'nav visibility must be restored from localStorage after reload (v4.0.114)');
    assert.ok(button.includes('watchNavToggle') && button.includes('localStorage.setItem(NAV_KEY'),
        'nav toggle clicks must be remembered (v4.0.114)');
    // v4.0.115: l'observation automatique ne mémorise QUE le masquage.
    assert.ok(button.includes('if (hidden && navStableCount >= 2) storeNavState(true)'),
        'automatic observation must only remember hidden state (v4.0.115)');
    // v4.0.118: syncNavState must actually run, new key, default = hidden.
    assert.ok(button.includes('syncNavState(); // v4.0.118'),
        'syncNavState must be called from the periodic ensure() (v4.0.118)');
    assert.ok(button.includes("const NAV_KEY = 'utoutlook-nav-pref'") &&
              button.includes("pref === 'open'"),
        'new pref key with hidden-by-default must be used (v4.0.118)');
    assert.ok(!/volet de navigation\|navigation pane\|menu/i.test(button) &&
              !controller.includes('/volet de navigation|navigation pane|menu/i'),
        'generic "menu" label must not reopen the pane (v4.0.118)');
    // v4.0.119: seuls les vrais taps doivent pouvoir ouvrir le volet.
    assert.ok(button.includes('if (!e.isTrusted) return;') &&
              controller.includes('if (!ev.isTrusted) return;'),
        'only trusted user clicks may reopen the nav pane (v4.0.119)');
});

test('v4.0.116: quit propre — app.quit() au lieu de app.exit(0) brutal', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    const start = main.indexOf('    async cleanupAndExit() {');
    const body = main.slice(start, main.indexOf('\n    createControllers()', start));
    assert.ok(body.includes('app.quit()'),
        'cleanupAndExit must use graceful app.quit() (v4.0.116)');
    assert.ok(!body.includes('app.exit(0);\n    }'),
        'cleanupAndExit must not end with a hard app.exit(0) (v4.0.116)');
    assert.ok(body.includes('hardExitTimer') && body.includes('3000'),
        'a 3s safety timer must force exit if graceful quit hangs (v4.0.116)');
});

test('v4.0.117: get-scale.sh — ne pas planter si GRID_UNIT_PX est absent', async () => {
    const fs = await import('node:fs');
    const script = fs.readFileSync(path.resolve(__dirname, '../../utils/get-scale.sh'), 'utf-8');
    assert.ok(script.includes('os.environ.get("GRID_UNIT_PX"'),
        'get-scale.sh must use os.environ.get with a default (v4.0.117)');
    assert.ok(!script.includes('os.environ["GRID_UNIT_PX"]'),
        'get-scale.sh must not index GRID_UNIT_PX directly (v4.0.117)');
});

test('v4.0.120: volet masqué par défaut via CSS injecté', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync(path.resolve(__dirname, '../public/main.css'), 'utf-8');
    const button = fs.readFileSync(path.resolve(__dirname, '../public/reload-button.js'), 'utf-8');
    assert.ok(css.includes('[data-app-section="NavigationPane"] {\n  display: none !important;'),
        'nav pane must be hidden by default in injected CSS (v4.0.120)');
    assert.ok(css.includes('html.utoutlook-show-nav [data-app-section="NavigationPane"]'),
        'show rule must be gated by a user-only class (v4.0.120)');
    assert.ok(button.includes("classList.toggle('utoutlook-show-nav', pref === 'open')"),
        'renderer must only add show class when pref is open (v4.0.120)');
});

test('v4.0.121: notification clear throttlée + bouton ⌫ au-dessus du clavier', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    const gestures = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');

    // v4.0.122: appel supprimé totalement (plus de notification « clear »).
    assert.ok(!cmd.includes('utoutlook_notify_clear') && !common.includes('utoutlook_notify_clear'),
        'ClearPersistent notification helper must be removed entirely (v4.0.122)');
    assert.ok(!cmd.includes('.notifs-cleared'),
        'old throttle flag must be gone (v4.0.122)');
    assert.ok(gestures.includes('Math.round(window.innerHeight * 0.72)'),
        'backspace button must be raised above the Maliit keyboard overlay (v4.0.121/126, 0.72 in v4.1.0)');
    assert.ok(gestures.includes('top:26px') && gestures.includes('syncUtilityButtons'),
        'utility login buttons must stay at top-left (clear of the border) and hide while a field is focused (v4.1.0)');
});

test('v4.0.123: l observer ne clique plus sur le volet de navigation', async () => {
    const fs = await import('node:fs');
    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    assert.ok(obs.includes('v4.0.123: SUPPRESSION du fallback'),
        'nav toggle fallback must be documented as removed (v4.0.123)');
    assert.ok(!obs.includes('btn.click(); // toggle back closed'),
        'observer must not click the nav toggle back closed (v4.0.123)');
    assert.ok(!obs.includes('Nav pane toggled open to read unread count'),
        'observer must not click the nav toggle open (v4.0.123)');
});

test('v4.0.124: badge non lus préservé sans ouvrir le volet', async () => {
    const fs = await import('node:fs');
    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    // Les sélecteurs findInboxElement() trouvent le treeitem même dans un volet
    // masqué (querySelector, pas de test de visibilité) -> badge OK sans toggle.
    assert.ok(obs.includes('[role="treeitem"][title*="non lus" i]'),
        'hidden inbox treeitem selector must remain (v4.0.124)');
    assert.ok(obs.includes('updateUnreadDebounced(docUnread)'),
        'badge update pipeline from document.title fallback must remain (v4.0.124)');
    assert.ok(obs.includes('document.contains(el)'),
        'inbox lookup must stay DOM-based, not visibility-based (v4.0.124)');
    assert.ok(!obs.includes('btn.click()'),
        'no programmatic click may reopen the nav pane (v4.0.124)');
});

test('v4.0.126: splash QML dès la 1re ligne du wrapper + étape i18n', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    const qml = fs.readFileSync(path.resolve(__dirname, '../../qml/startup.qml'), 'utf-8');

    // La barre doit être lancée AVANT test_net (6 s de sondes) et avant les
    // cleanup() successifs — c'était le motif du splash trop tardif.
    const startIdx = cmd.indexOf('\nstart_startup_qml #');
    const netIdx = cmd.indexOf('\ntest_net\n');
    assert.ok(startIdx >= 0 && netIdx >= 0 && startIdx < netIdx,
        'startup QML must be launched before test_net (v4.0.126)');
    assert.ok(cmd.includes('utoutlook_set_start_step 2') &&
              cmd.includes('utoutlook_set_start_step 3') &&
              cmd.includes('utoutlook_set_start_step 4') &&
              cmd.includes('utoutlook_set_start_step 5'),
        'all startup steps must be announced (v4.0.126)');

    // Message d'étape : 8 langues, numéro substitué sans sed (AppArmor).
    assert.ok(common.includes('"qml.startStep")'),
        'i18n step message must live in the shell catalog (v4.0.126)');
    for (const needle of ['Starting up', 'Iniciando', 'Startvorgang', 'Avvio',
                          'A iniciar', '正在启动', 'جارٍ التشغيل', 'Démarrage']) {
        assert.ok(common.includes(needle), `missing step translation: ${needle} (v4.0.126)`);
    }
    assert.ok(common.includes('msg="${msg//%N/${n}}"'),
        'step number must be replaced with a bash builtin, not sed (v4.0.126)');
    assert.ok(common.includes('utoutlook_startup_qml_alive()') &&
              cmd.includes('if utoutlook_startup_qml_alive; then'),
        'wrapper must preserve our early splash window (v4.0.126)');

    // v4.1.0: AppArmor refuse au qmlscene la lecture d'un .qml dans /tmp —
    // la barre doit être AUTONOME (aucun fichier externe) sous peine de
    // laisser l'utilisateur bloqué sur la splash Lomiri.
    assert.ok(!qml.includes('Loader {') && !qml.includes('source:') && !qml.includes('import "/tmp'),
        'startup.qml must NOT depend on an external QML file (v4.1.0 regression)');
    assert.ok(common.includes('UTOUTLOOK_STEP_FILE="${UTOUTLOOK_CONFIG_DIR}/start-step"'),
        'step info must be written as plain text in the app config dir (v4.1.0)');
    assert.ok(common.includes('utoutlook_write_startup_qml()') &&
              common.includes('UTOUTLOOK_STARTUP_QML="${UTOUTLOOK_CONFIG_DIR}/startup.qml"') &&
              common.includes('text: "%s"'),
        'startup QML with the step label must be generated in the app config dir (v4.1.0)');
    assert.ok(cmd.includes('qmlscene "${UTOUTLOOK_STARTUP_QML}"'),
        'wrapper must launch the generated QML (v4.1.0)');
});

test('v4.0.127: rendu logiciel auto sur crash GPU + override utilisateur', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    const afterPack = fs.readFileSync(path.resolve(__dirname, '../build/afterPack.mjs'), 'utf-8');
    const i18n = fs.readFileSync(path.resolve(__dirname, '../src/i18n.mjs'), 'utf-8');
    const preload = fs.readFileSync(path.resolve(__dirname, '../src/controller/preload.js'), 'utf-8');
    const gestures = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');

    // Détection auto : signature GPU + marqueur pour ne rebaser qu'une fois.
    assert.ok(common.includes('utoutlook_resolve_render_mode()'),
        'shell must resolve the render mode at each launch (v4.0.127)');
    assert.ok(common.includes('GPU process isn\'t usable|error_code=1002'),
        'GPU crash signatures must be scanned (v4.0.127)');
    assert.ok(common.includes('UTOUTLOOK_GPU_CRASH_MARKER') &&
              common.includes('UTOUTLOOK_RENDER_MODE_FILE'),
        'auto fallback must be persisted and crashes consumed (v4.0.127)');
    assert.ok(common.includes('seen=${last}'),
        'first launch must consume old crash history without switching (v4.0.127)');
    assert.ok(common.includes('"shell.softwareMode")'),
        'auto switch must be announced with an i18n notification (v4.0.127)');
    for (const needle of ['Software rendering enabled', 'Renderizado por software',
                          'Software-Rendering', 'Rendering software', 'Renderização por software',
                          '软件渲染', 'العرض البرمجي', 'Rendu logiciel']) {
        assert.ok(common.includes(needle), `missing software-mode translation: ${needle} (v4.0.127)`);
    }

    // Le wrapper applique le mode au lancement d'Electron.
    assert.ok(cmd.includes('RENDER_MODE=$(utoutlook_resolve_render_mode)'),
        'wrapper must apply the resolved render mode (v4.0.127)');
    // Electron 44 n'embarque plus libEGL.so/libGLESv2.so : les flags ANGLE
    // swiftshader font échouer le GPU process (1002) puis FATAL → l'app ne
    // démarre plus. Le mode logiciel doit rester in-process + compositing CPU.
    assert.ok(cmd.includes('--in-process-gpu --disable-gpu --disable-gpu-compositing --enable-unsafe-swiftshader') &&
              !cmd.includes('--use-angle=swiftshader') && !cmd.includes('--use-gl=angle') &&
              cmd.includes('--enable-unsafe-swiftshader'),
        'software mode must use in-process GPU + CPU compositing, not ANGLE (v4.1.0)');

    // SwiftShader doit rester dans le click, sinon le mode logiciel est vide.
    assert.ok(!afterPack.includes("tryRemove('libvk_swiftshader.so')") &&
              !afterPack.includes("tryRemove('libvulkan.so.1')") &&
              !afterPack.includes("tryRemove('vk_swiftshader_icd.json')"),
        'afterPack must keep SwiftShader libs for software rendering (v4.0.127)');

    // Override utilisateur : bouton page de login + IPC, libellés 8 langues.
    assert.ok(preload.includes('getRenderMode') && preload.includes('setRenderMode'),
        'preload must expose the render-mode override (v4.0.127)');
    assert.ok(gestures.includes('ensureRenderModeButton'),
        'login page must expose the software-rendering toggle (v4.0.127)');
    assert.ok(i18n.includes("'render.enable'") && i18n.includes("'render.disable'"),
        'toggle labels must be in the i18n catalog (v4.0.127)');
});

test('v4.1.0: bascule auto du mode rendu après échec de démarrage, avec message i18n', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');

    assert.ok(cmd.includes('function flip_render_mode()') &&
              cmd.includes('function compute_gpu_options()') &&
              cmd.includes('compute_gpu_options "${RENDER_MODE}"') &&
              cmd.includes('flip_render_mode || utoutlook_notify') &&
              cmd.includes('flip_render_mode || true') &&
              cmd.includes('RENDER_FLIPS=0') &&
              cmd.includes('"${RENDER_FLIPS:-0}" -ge 2'),
        'wrapper must auto-flip render mode on startup failure, max twice (v4.1.0)');
    assert.ok(common.includes('"shell.autoFallback")') &&
              common.includes('Display mode changed automatically') &&
              common.includes('Mode d\'affichage changé automatiquement'),
        'auto fallback must be announced in the i18n catalog (v4.1.0)');
});

test('v4.0.128: écran de secours QML rendu logiciel / OpenGL sur crash GPU', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    const qml = fs.readFileSync(path.resolve(__dirname, '../../qml/render-rescue.qml'), 'utf-8');

    // Le QML ne peut pas écrire de fichier : il loggue son choix sur stdout.
    assert.ok(qml.includes('UT_RENDER_CHOICE=software') &&
              qml.includes('UT_RENDER_CHOICE=opengl') &&
              qml.includes('Qt.exit(10)') && qml.includes('Qt.exit(11)') &&
              qml.includes('requestActivate()'),
        'rescue buttons must log + exit with distinct codes and activate window (v4.1.0)');
    const rescueStart = cmd.indexOf('function show_render_rescue()');
    const rescueBody = cmd.slice(rescueStart, cmd.indexOf('###init', rescueStart));
    assert.ok(rescueBody.includes('while [ ${i} -lt 30 ]') && rescueBody.includes('rc=$?') &&
              rescueBody.includes('[ "${rc}" -eq 11 ]') && rescueBody.includes('[ "${rc}" -eq 10 ]'),
        'show_render_rescue must wait 30s and read the exit code as a fallback (v4.1.0)');
    assert.ok(!qml.includes('/tmp/utoutlook-qml-i18n.js'),
        'rescue screen must NOT import a /tmp JS file — AppArmor denies it (v4.1.0)');
    assert.ok(!qml.includes('import QtQuick.Controls'),
        'rescue screen must stay pure QtQuick for qmlscene on UT (v4.0.128)');
    assert.ok(common.includes('utoutlook_write_rescue_qml()') &&
              common.includes('${UTOUTLOOK_CONFIG_DIR}/render-rescue.qml'),
        'rescue screen must be generated in the app config dir with labels (v4.1.0)');

    // Le wrapper détecte le crash FRAIS avant de consommer le marqueur.
    assert.ok(common.includes('utoutlook_gpu_crash_is_new()'),
        'wrapper must detect fresh GPU crashes before resolving mode (v4.0.128)');
    assert.ok(common.includes("utoutlook_t 'qml.renderRescueTitle'") &&
              common.includes("utoutlook_t 'qml.renderSoftware'") &&
              common.includes("utoutlook_t 'qml.renderOpengl'"),
        'rescue labels must come from the i18n catalog (v4.1.0)');
    for (const needle of ['UToutlook hit a graphics problem', 'UToutlook tuvo un problema gráfico',
                          'UToutlook hatte ein Grafikproblem', 'UToutlook ha riscontrato un problema grafico',
                          'O UToutlook teve um problema gráfico', 'UToutlook 遇到图形问题',
                          'واجه UToutlook مشكلة رسومية', 'UToutlook a rencontré un problème graphique']) {
        assert.ok(common.includes(needle), `missing rescue-screen translation: ${needle} (v4.0.128)`);
    }

    // Affiché seulement sans override, 8 s max, puis le choix est persisté.
    assert.ok(cmd.includes('function show_render_rescue()') &&
              cmd.includes('GPU_CRASH_NEW=1') &&
              cmd.includes('UT_RENDER_CHOICE=opengl') &&
              cmd.includes('UT_RENDER_CHOICE=software'),
        'wrapper must read the rescue choice markers (v4.0.128)');
    assert.ok(cmd.includes('show_render_rescue') && cmd.includes('start_startup_qml # réafficher'),
        'wrapper must restore the progress bar after the rescue screen (v4.0.128)');
});

test('v4.1.0: crédit « Inspired from Julien Alarcon » + liens réels du projet', async () => {
    const fs = await import('node:fs');
    const root = path.resolve(__dirname, '../../..');
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    const i18n = fs.readFileSync(path.resolve(__dirname, '../src/i18n.mjs'), 'utf-8');
    const readme = fs.readFileSync(path.resolve(root, 'README.md'), 'utf-8');

    assert.strictEqual(pkg.author.name, 'Inspired from Julien Alarcon',
        'author credit must say inspired, not authored (v4.1.0)');
    assert.strictEqual(pkg.build.appId, 'io.github.mathiasmb31.utoutlook',
        'Electron appId must point to the real project (v4.1.0)');
    assert.ok(pkg.homepage === 'https://github.com/mathiasmb31/utoutlook' &&
              pkg.bugs.url === 'https://github.com/mathiasmb31/utoutlook/issues' &&
              pkg.repository.url.includes('mathiasmb31/utoutlook'),
        'package.json links must point to the utoutlook project (v4.1.0)');
    assert.ok(readme.includes('Inspired from Julien Alarcon') &&
              readme.includes('./build-deploy.sh'),
        'README credit and links must be updated (v4.1.0)');
    assert.ok(!/julian[-\s]?alarcon/i.test(readme + JSON.stringify(pkg)),
        'no stale upstream credit or link may remain (v4.1.0)');
    for (const needle of ['Inspiré de Julien Alarcon', 'Inspired from Julien Alarcon',
                          'Inspirado en Julien Alarcon', 'Inspiriert von Julien Alarcon',
                          'Ispirato a Julien Alarcon', 'Inspirado em Julien Alarcon',
                          '灵感来自 Julien Alarcon', 'مستوحى من Julien Alarcon']) {
        assert.ok(i18n.includes(needle), `missing about credit translation: ${needle} (v4.1.0)`);
    }
});

test('v4.1.0: icône — WM_CLASS alignée sur le click + démarrage en 6 étapes', async () => {
    const fs = await import('node:fs');
    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    const desktop = fs.readFileSync(path.resolve(__dirname, '../../utoutlook.desktop'), 'utf-8');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');

    assert.ok(!/^StartupWMClass=/m.test(desktop),
        'desktop file must have no StartupWMClass (v4.2.3, back to v4.0.98)');
    assert.ok(main.includes('app.setDesktopName("UToutlookmail")'),
        'Electron desktop name must be the v4.0.98 value (v4.2.3)');
    assert.ok(cmd.includes('prospect-mail "$dpioptions" "$sandboxoptions" "$gpuoptions" &'),
        'wrapper must keep launching Electron in background with no --class (v4.2.3)');

    // Étape 3 → 4 avancée après l'extinction des vieux process (~50 s sinon).
    assert.ok(common.includes('of 6') && common.includes('sur 6'),
        'startup steps must be numbered out of 6 (v4.1.0)');
    assert.ok(cmd.includes('utoutlook_set_start_step 4') &&
              cmd.includes('utoutlook_set_start_step 5') &&
              cmd.includes('utoutlook_set_start_step 6'),
        'all 6 startup steps must be announced (v4.1.0)');

    // Cause racine de la lenteur : les zombies comptés comme vivants.
    assert.ok(common.includes('utoutlook_pid_is_zombie()') &&
              common.includes('utoutlook_prospect_running()'),
        'shell must distinguish zombies from live processes (v4.1.0)');
    assert.ok(!common.includes('pkill" -0 prospect-mail'),
        'kill_app must not use pkill -0 which matches zombies (v4.1.0)');
    assert.ok(cmd.includes('utoutlook_prospect_running'),
        'wrapper liveness check must ignore zombies (v4.1.0)');

    // Prévention : wrapper-quit transforme le SIGTERM du wrapper en vrai quit
    // (le swipe-close Lomiri, sans flag, continue de seulement masquer).
    assert.ok(fs.readFileSync(path.resolve(__dirname, '../src/config.mjs'), 'utf-8')
              .includes('FORCE_QUIT_FILE'),
        'a dedicated force-quit flag file must exist (v4.1.0)');
    const sigterm = main.slice(main.indexOf('process.on("SIGTERM"'),
                               main.indexOf('app.on("window-all-closed"'));
    assert.ok(sigterm.includes('FORCE_QUIT_FILE') && sigterm.includes('cleanupAndExit()') &&
              sigterm.includes('win.hide()'),
        'SIGTERM must clean-quit with the flag, hide on swipe-close (v4.1.0)');
    assert.ok(common.includes('printf \'quit:%s\' "${UTOUTLOOK_WRAPPER_PID:-unknown}" > "${UTOUTLOOK_FORCE_QUIT}"'),
        'wrapper must write the force-quit flag before SIGTERM (v4.1.0)');
    assert.ok(!cmd.includes('pkill -9 -f "bin/App/prospect-mail"') &&
              cmd.includes('pkill -TERM -f "bin/App/prospect-mail"') &&
              cmd.includes('kill -TERM "${_pid}"'),
        'wrapper must stop SIGKILLing Electron at startup (v4.1.0)');
    assert.ok(common.includes('kill -TERM "$pid"') && !common.includes('kill -9 "$pid"'),
        'proc scan must use TERM so Electron can reap its children (v4.1.0)');

    // Course entre deux wrappers : le pidfile doit être écrit dès la 1re ligne
    // et un wrapper périmé doit sortir au lieu de tuer le plus récent.
    assert.ok(cmd.indexOf('echo $$ > "${UTOUTLOOK_DATA_DIR}/wrapper.pid"') <
              cmd.indexOf('test_net\n'),
        'wrapper must claim the pidfile before any long wait (v4.1.0)');
    assert.ok(common.includes('wrapper $self périmé (owner=$p) — sortie immédiate'),
        'stale wrapper must exit instead of killing the newer one (v4.1.0)');

    // i18n QML : plus de fichier dans /tmp (AppArmor) — import par nom
    // résolu via l'option -I passée à qmlscene.
    assert.ok(common.includes('utoutlook_write_error_qmls()') &&
              common.includes('${UTOUTLOOK_CONFIG_DIR}/nonetwork.qml'),
        'QML screens must be generated in the app config dir (v4.1.0)');
    assert.ok(!fs.readFileSync(path.resolve(__dirname, '../../qml/nonetwork.qml'), 'utf-8')
              .includes('/tmp/utoutlook-qml-i18n.js') &&
              !fs.readFileSync(path.resolve(__dirname, '../../qml/exit.qml'), 'utf-8')
              .includes('/tmp/utoutlook-qml-i18n.js'),
        'QML screens must import i18n by name (v4.1.0)');
    assert.ok(cmd.includes('qmlscene "${UTOUTLOOK_CONFIG_DIR}"/nonetwork.qml'),
        'wrapper must launch the generated nonetwork QML (v4.1.0)');

    // Démarrage long : attentes réduites (notification/flag de fermeture).
    assert.ok(cmd.includes('utoutlook_wait_notifications 6') &&
              !cmd.includes('utoutlook_wait_notifications 15'),
        'notification wait must be shortened to 6s (v4.1.0)');
    assert.ok(cmd.includes('while [ ${_i} -lt 4 ]') && cmd.includes('sleep_int 2'),
        'closing-flag wait must be 4x2s instead of 5x3s (v4.1.0)');
    assert.ok(fs.readFileSync(path.resolve(__dirname, '../../utils/mkdir.c'), 'utf-8')
              .includes('errno != EEXIST'),
        'mkdir must treat EEXIST as success (no log noise) (v4.1.0)');

    // Fenêtre "visible" pour Electron mais surface Mir perdue après unlock.
    const ctl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    assert.ok(ctl.includes('resurfaceWindow(stealFocus = false)') &&
              ctl.includes('setAlwaysOnTop(true)') && ctl.includes('webContents.invalidate()'),
        'controller must re-surface the Mir window without hide() (v4.1.0)');
    assert.ok(ctl.includes("this._on(powerMonitor, 'unlock-screen'") &&
              ctl.includes('surfaceHealthPoll = setInterval'),
        'unlock-screen + periodic re-surface must be wired (v4.1.0)');
    assert.ok(main.includes('this.mailController.resurfaceWindow(true);'),
        'socket show must force surface re-integration (v4.1.0)');
    // Fix "login invisible": le pulse alwaysOnTop seul ne suffit pas — il faut
    // un vrai re-map de la surface. v4.1.8: le +1px ne suffisait pas sur device,
    // remplacé par un déplacement réel (x + 40) puis restauration 250 ms plus tard.
    assert.ok(ctl.includes('setBounds({ ...b, x: b.x + 40 })') &&
              ctl.includes("this._resurfaceNudgePending = false;\n                }, 250);"),
        'surface re-map must use a real offscreen bounce, restored after 250ms (v4.1.8)');
    assert.ok(ctl.includes('this.win.on("focus", () => {') &&
              ctl.includes('this.resurfaceWindow(false);'),
        'login blur must force a real surface re-map on focus (v4.1.0)');
});

test('v4.0.125: bouton Quitter — cleanupAndExit plus court-circuité (app vivante mais invisible)', async () => {
    const fs = await import('node:fs');
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.mjs'), 'utf-8');
    const controller = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    // before-quit / will-quit posaient isQuitting AVANT d'appeler
    // cleanupAndExit(), dont le garde-fou `if (this.isQuitting) return`
    // sortait immédiatement : aucun exitclient, heartbeat toujours actif,
    // fenêtre masquée → « app vivante mais invisible » après le bouton Quitter.
    for (const evt of ['will-quit', 'before-quit']) {
        const start = main.indexOf(`app.on("${evt}"`);
        assert.ok(start >= 0, `${evt} handler must exist (v4.0.125)`);
        const block = main.slice(start, main.indexOf('});', start));
        assert.ok(block.includes('e.preventDefault()'),
            `${evt} must cancel the default quit so cleanup can run (v4.0.125)`);
        assert.ok(!block.includes('this.isQuitting = true'),
            `${evt} must NOT set isQuitting before calling cleanupAndExit (v4.0.125)`);
        assert.ok(block.includes('this.cleanupAndExit()'),
            `${evt} must call cleanupAndExit (v4.0.125)`);
    }

    const caeStart = main.indexOf('    async cleanupAndExit() {');
    const cae = main.slice(caeStart, main.indexOf('\n    createControllers()', caeStart));
    assert.ok(cae.includes('if (this.cleanupStarted) return;'),
        'cleanupAndExit must guard on a dedicated cleanupStarted flag (v4.0.125)');
    assert.ok(!cae.includes('if (this.isQuitting) return;'),
        'cleanupAndExit must not guard on isQuitting (v4.0.125)');
    assert.ok(cae.includes('global.utoutlookQuitting = true'),
        'cleanupAndExit must flag a real quit for the window controller (v4.0.125)');

    // v4.4.4: le handler reste tolerant, mais hideOnClose est force a false
    // quit masque la fenêtre et annule app.quit() → app invisible.
    const closeStart = controller.indexOf('this.win.on("close", (e) => {');
    const close = controller.slice(closeStart, controller.indexOf('});', closeStart));
    assert.ok(close.includes('settings.get("hideOnClose")'),
        'hideOnClose must still apply outside a quit (v4.0.125)');
    assert.ok(close.includes('!global.utoutlookQuitting'),
        'close handler must skip hideOnClose during a real quit (v4.0.125)');
    assert.ok(close.includes('this.appStartedAt') && close.includes('10000'),
        'a spurious close right after startup must be ignored, not hide the window (v4.4.3)');
});

test('v4.1.0 (revue): outillage release et garde-fous', async () => {
    const fs = await import('node:fs');
    const root = path.resolve(__dirname, '../../..');
    const watch = fs.readFileSync(path.resolve(root, 'watch-log.sh'), 'utf-8');
    const menu = fs.readFileSync(path.resolve(root, 'menu.sh'), 'utf-8');
    const store = fs.readFileSync(path.resolve(root, 'openstore-prepare.sh'), 'utf-8');
    const hook = fs.readFileSync(path.resolve(root, 'githooks/pre-push'), 'utf-8');

    assert.ok(watch.includes('adb devices') && watch.includes('appareil verrouillé'),
        'watch-log must check the device and explain locked-device failures');
    assert.ok(menu.includes('-maxdepth 4'), 'menu must detect version in subfolders');
    assert.ok(store.includes('UPLOAD_OK') && store.includes('"OK"'),
        'OpenStore upload must require the explicit OK argument');
    assert.ok(hook.includes('--not --remotes') && !hook.includes('--not --all'),
        'pre-push must inspect new-branch objects (F16)');
});

test('v4.1.0: QML générés (étape/erreurs) — pas de modèle testé à la place', async () => {
    const fs = await import('node:fs');
    const common = fs.readFileSync(path.resolve(__dirname, '../../utils/common.sh'), 'utf-8');
    assert.ok(common.includes('utoutlook_write_startup_qml()') &&
              common.includes('text: "%s"') &&
              common.includes('NumberAnimation'),
        'startup QML generator must embed the step label and the animation');
    assert.ok(common.includes('utoutlook_write_error_qmls()') &&
              common.includes('QmlI18n.NO_NETWORK/${repl}') &&
              common.includes('QmlI18n.EXIT_TIMEOUT/${repl}'),
        'error QML generators must inline translated labels (F11)');
    assert.ok(common.includes('source: \\"${WD}/qml/no-network-icon.png\\"') &&
              common.includes('source: \\"${WD}/qml/exit.jpg\\"'),
        'generated QML must use absolute image paths inside the click');
});

test('v4.1.0 (revue B8): destroy() retire les listeners à la recréation', async () => {
    const fs = await import('node:fs');
    const ctrl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const tray = fs.readFileSync(path.resolve(__dirname, '../src/controller/tray-controller.mjs'), 'utf-8');
    assert.ok(ctrl.includes('_on(target, event, handler)') &&
              ctrl.includes('removeListener(event, handler)'),
        'controller must track and remove its listeners');
    assert.ok(ctrl.includes('destroy()') && ctrl.includes('ipcMain.removeHandler(channel)') &&
              ctrl.includes('ipcMain.removeAllListeners(channel)'),
        'destroy() must clear IPC handlers as well');
    assert.ok(tray.includes('ctl.destroy()') && tray.indexOf('quitAll()') < tray.indexOf('ctl.destroy()'),
        'toggleWindowFrame must close windows then destroy controllers (v4.1.0)');
    assert.ok(ctrl.includes("this._on(app, 'browser-window-created'") &&
              ctrl.includes("this._on(powerMonitor, 'unlock-screen'"),
        'app/powerMonitor/screen listeners must be registered through _on');
});

test('v4.1.0 (analyse approfondie): correctifs applicatifs et outillage', async () => {
    const fs = await import('node:fs');
    const root = path.resolve(__dirname, '../../..');
    const cmd = fs.readFileSync(path.resolve(root, 'utoulookmail/command.sh'), 'utf-8');
    const common = fs.readFileSync(path.resolve(root, 'utoulookmail/utils/common.sh'), 'utf-8');
    const clickable = fs.readFileSync(path.resolve(root, 'utoulookmail/clickable.yaml'), 'utf-8');
    const ctl = fs.readFileSync(path.resolve(__dirname, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const tray = fs.readFileSync(path.resolve(__dirname, '../src/controller/tray-controller.mjs'), 'utf-8');
    const obs = fs.readFileSync(path.resolve(__dirname, '../public/unread-number-observer.js'), 'utf-8');
    const gestures = fs.readFileSync(path.resolve(__dirname, '../public/gestures.js'), 'utf-8');
    const reload = fs.readFileSync(path.resolve(__dirname, '../public/reload-button.js'), 'utf-8');
    const store = fs.readFileSync(path.resolve(root, 'openstore-prepare.sh'), 'utf-8');
    const ci = fs.readFileSync(path.resolve(root, '.github/workflows/build-click.yml'), 'utf-8');

    // socket sans python3 (non embarqué) — helper C dédié
    assert.ok(!common.includes('python3') && common.includes('socketcli'),
        'socket helpers must use the embedded C helper, not python3 (F3)');
    assert.ok(clickable.includes('socketcli.c -o') && clickable.includes('prospect-mail-${v}-arm64.tar.gz'),
        'socket helper compiled and tar.gz selected by manifest version (F5)');

    // swipe-close: fenêtre masquée, watchdog neutralisé
    assert.ok(cmd.includes('UTOUTLOOK_SWIPE_HIDDEN') && cmd.includes('LOMIRI_TERM:-0') ,
        'wrapper must flag swipe-close (E2)');
    assert.ok(ctl.includes('SWIPE_HIDDEN_FILE') && ctl.includes('if (this.recreating)'),
        'controller must honour swipe-hidden and ignore closed during recreation (E1/E2)');
    assert.ok(tray.includes('ctl.recreating = true') && !tray.includes('app.relaunch();'),
        'tray must flag recreation and let the wrapper relaunch (E1/M5)');

    // observer: badge toujours à jour, notifications pas supprimées par le timer
    assert.ok(obs.includes('silentNotifications') && obs.includes('updateUnreadDebounced(unread);') &&
              obs.includes('observeTarget = leftPanel || document.body'),
        'observer must update badge and keep detecting without the pane (renderer #1/#2)');
    assert.ok(obs.includes('tr(\'observerDomChanged\')') && obs.includes('tr(\'reminderFallback\')'),
        'observer texts must be i18n (renderer #6)');

    // boutons login hors du champ + first-install dispatch par envoyeur
    assert.ok(gestures.includes('top:26px') && gestures.includes('syncUtilityButtons') &&
              gestures.includes("mousedown', e => e.preventDefault()") &&
              gestures.includes('window.innerHeight * 0.72'),
        'login utility buttons must stay clear of the input and the OSK (v4.1.0)');
    assert.ok(!ctl.includes('dialog.showMessageBox'),
        'first-install must not open a native modal dialog (blur + invisible window on Lomiri) (v4.1.0)');
    assert.ok(ctl.includes('static byWebContents') && ctl.includes('const owner = MailWindowController.byWebContents.get(event.sender)'),
        'IPC handlers must dispatch to the controller owning the sender (M4)');

    // reload button visible when the list is broken
    assert.ok(reload.includes("reload.style.display = listReady() ? '' : 'none'") &&
              !reload.includes("a.style.setProperty('overflow', 'visible'"),
        'reload button must be available on broken lists without breaking scroll (renderer #4/#5)');
    assert.ok(ctl.includes('render-process-gone') && ctl.includes('this.win.reload()'),
        'dead renderer must trigger a reload (M6)');

    // release/outillage
    assert.ok(store.includes("d['data'].get('version')") && store.includes('--config -'),
        'OpenStore API v4 and API key must be handled correctly (F7/F8)');
    assert.ok(!ci.includes('*.click') && ci.includes('*.tar.gz'),
        'CI must never publish .click files (F2)');
    assert.ok(fs.readFileSync(path.resolve(root, 'check-history.sh'), 'utf-8').includes('--strict'),
        'history confidentiality guard must exist (F1)');
    assert.ok(common.includes('utoutlook_qml_escape'), 'QML strings must be escaped (renderer #8)');
    const buildFast = fs.readFileSync(path.resolve(root, 'utoulookmail/build-fast.sh'), 'utf-8');
    assert.ok(buildFast.includes('cmake -G Ninja') &&
              buildFast.includes('"$PROJECT_DIR/CMakeCache.txt"') &&
              !buildFast.includes('rm -f "$PROJECT_DIR/Makefile"'),
        'build-fast must clean in-source cmake artifacts WITHOUT deleting the real Makefile (F4)');
});

// ============================================================
// v4.3.8 — stabilite : plus de glass, bascule de rendu accessible
// ============================================================

test('v4.3.8: no blur animation on the message list (software mode hangs)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');
    const css = fs.readFileSync(path.join(here, '../public/main.css'), 'utf-8');

    assert.ok(!css.includes('utoutlook-list-glass-in') &&
              !css.includes('filter: blur('),
        'no blur keyframes/filter may remain in the injected CSS (v4.3.8)');
    assert.ok(!btn.includes('READY_CLASS') && !btn.includes('signalListReady'),
        'the list-ready glass trigger must be gone (v4.3.8)');
});

test('v4.4.5: render-mode choices live in the settings sheet', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sheet = fs.readFileSync(path.join(here, '../public/settings-sheet.js'), 'utf-8');
    const ctrl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    assert.ok(sheet.includes("['auto', 'settingsRenderAuto', 'Automatic']") &&
              sheet.includes("['software', 'settingsRenderSoftware', 'Software']") &&
              sheet.includes("['hardware', 'settingsRenderHardware', 'Hardware']") &&
              sheet.includes('setRenderMode(mode)'),
        'settings sheet must expose the three render modes (v4.4.5)');
    const inject = ctrl.slice(ctrl.indexOf('injectReloadButton()'));
    assert.ok(inject.includes('renderSoftwareEnable: tr[\'render.enable\']') &&
              inject.includes('renderSoftwareDisable: tr[\'render.disable\']') &&
              inject.includes('relaunchNotice: tr[\'splash.relaunch\']'),
        'render toggle labels must be injected in 10 languages (v4.3.8)');
});

test('v4.3.8: "software rendering after a crash" is only announced on a real switch', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const cmd = fs.readFileSync(path.join(here, '../../command.sh'), 'utf-8');

    const block = cmd.slice(cmd.indexOf('if [ "${RENDER_MODE}" = "software" ]; then'),
                            cmd.indexOf('echo "launch utoutlookmail"'));
    assert.ok(block.includes('if [ "${GPU_CRASH_NEW}" -eq 1 ]'),
        'softwareMode notification must be gated on a fresh GPU crash (v4.3.8)');
    assert.ok(block.includes('software|on|1) : ;;'),
        'already-software mode must never announce a crash (v4.3.8)');
    assert.ok(cmd.includes('read -r CUR_RENDER_MODE < "${UTOUTLOOK_RENDER_MODE_FILE}"'),
        'current mode must be read with the bash builtin (v4.3.8)');
});

// ============================================================
// v4.3.7 — robustesse : logs bornes et polls en arriere-plan
// ============================================================

test('v4.3.7: crash.log is capped without touching wrapper.log line numbers', async () => {
    const {capLogIfLarge, MAX_CRASH_LOG_BYTES} = await import('../src/log-rotation.mjs');
    let size = MAX_CRASH_LOG_BYTES - 1;
    let truncated = 0;
    const fakeFs = {
        statSync: () => ({size}),
        writeFileSync: (_p, data) => { assert.strictEqual(data, ''); truncated++; },
    };
    assert.strictEqual(capLogIfLarge('crash.log', MAX_CRASH_LOG_BYTES, fakeFs), false);
    assert.strictEqual(truncated, 0, 'a log below the limit must be left alone');
    size = MAX_CRASH_LOG_BYTES + 1;
    assert.strictEqual(capLogIfLarge('crash.log', MAX_CRASH_LOG_BYTES, fakeFs), true);
    assert.strictEqual(truncated, 1, 'an oversized log must be truncated');
    assert.strictEqual(capLogIfLarge('missing.log', MAX_CRASH_LOG_BYTES, {
        statSync: () => { throw new Error('ENOENT'); },
        writeFileSync: () => { throw new Error('should not write'); },
    }), false);
});

test('v4.3.7: watchdog noise is debug-only and background gating is whitelisted', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const wrapper = fs.readFileSync(path.resolve(here, '../../command.sh'), 'utf-8');
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const main = fs.readFileSync(path.join(here, '../src/main.mjs'), 'utf-8');

    assert.ok(wrapper.includes('[ "${UTOUTLOOK_DEBUG:-0}" = "1" ] && echo "done"'),
        'watchdog "done" noise must be debug-only (v4.3.7)');
    assert.ok(wrapper.includes('[ "${UTOUTLOOK_DEBUG:-0}" = "1" ] && echo "client is alive"'),
        'watchdog "client is alive" noise must be debug-only (v4.3.7)');
    assert.ok(ctl.includes('isBackgrounded()') &&
              ctl.includes('if (this.isBackgrounded()) return; // v4.3.7: inutile quand masque') &&
              ctl.includes('if (this.isBackgrounded() && !this.isOffline) return;'),
        'only the list watchdog and connectivity poll may be gated (v4.3.7)');
    const gates = ctl.match(/if \(this\.isBackgrounded\(\)(?: && !this\.isOffline)?\) return;/g) || [];
    assert.strictEqual(gates.length, 2,
        'only the list watchdog and the connectivity poll may use the background gate');
    assert.ok(!main.includes('isBackgrounded'),
        'heartbeat lives in main.mjs and must never be gated (v4.2.5 clean quit)');
    assert.ok(main.includes('capLogIfLarge(file, MAX_CRASH_LOG_BYTES)'),
        'crash.log must be capped from main.mjs (v4.3.7)');
});

// ============================================================
// v4.3.7 — supervision inverse wrapper <- Electron
// ============================================================

test('v4.3.7: wrapper monitor never quits on an unknown or newer wrapper', async () => {
    const {checkWrapperAlive} = await import('../src/wrapper-monitor.mjs');
    const base = (pidfile, proc, expected = '4242') => ({
        pidFilePath: 'wrapper.pid',
        expectedPid: expected,
        readFileSync: () => pidfile,
        readProc: () => proc,
        probe: () => 'unknown', // on force le repli /proc pour ces cas
    });
    assert.strictEqual(checkWrapperAlive({...base('4242\n', '4242 (bash) S 1 1'), expectedPid: ''}), 'unknown');
    assert.strictEqual(checkWrapperAlive({pidFilePath: 'wrapper.pid', expectedPid: '', readFileSync: () => '4242'}), 'unknown');
    assert.strictEqual(checkWrapperAlive(base('9999\n', '9999 (bash) S 1 1')), 'unknown',
        'a newer wrapper PID must not trigger a quit');
    assert.strictEqual(checkWrapperAlive(base('garbage', '4242 (bash) S 1 1')), 'unknown');
    // v4.3.8: le probe (signal 0) est la source de verite. Sans lui, on
    // replie sur /proc, et une lecture impossible n'est PAS une mort.
    const withProbe = (proc, probeState) => ({
        pidFilePath: 'wrapper.pid', expectedPid: '4242',
        readFileSync: () => '4242\n',
        readProc: () => proc,
        probe: () => probeState,
    });
    assert.strictEqual(checkWrapperAlive(withProbe('4242 (bash) S 1 1', 'alive')), true);
    assert.strictEqual(checkWrapperAlive(withProbe('4242 (bash) S 1 1', 'dead')), false);
    assert.strictEqual(checkWrapperAlive(withProbe('4242 (bash) S 1 1', 'unknown')), true,
        '/proc dit S => vivant quand le probe est indecis');
    assert.strictEqual(checkWrapperAlive(base('4242\n', '4242 (bash) Z 1 1')), false,
        'a zombie wrapper counts as dead');
    assert.strictEqual(checkWrapperAlive({
        pidFilePath: 'wrapper.pid', expectedPid: '4242',
        readFileSync: () => { throw new Error('ENOENT'); },
        readProc: () => 'unused',
    }), 'unknown',
        'an unreadable pidfile must NEVER quit Electron (v4.3.8 false positives)');
    assert.strictEqual(checkWrapperAlive({
        pidFilePath: 'wrapper.pid', expectedPid: '4242',
        readFileSync: () => '4242\n',
        readProc: () => { throw new Error('EACCES'); },
    }), 'unknown',
        'an unreadable /proc must NEVER quit Electron (v4.3.8 false positives)');
});

test('v4.3.7: reverse supervision uses cleanupAndExit with quit/rotation guards', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const main = fs.readFileSync(path.join(here, '../src/main.mjs'), 'utf-8');
    const block = main.slice(main.indexOf('v4.3.7 — supervision INVERSE'));

    assert.ok(block.includes('appInstance.cleanupAndExit()'),
        'a dead wrapper must trigger a CLEAN exit, not app.exit (v4.0.116/v4.0.125)');
    assert.ok(!block.slice(0, 1600).includes('app.exit('),
        'no direct app.exit in the reverse supervision block');
    assert.ok(block.includes('!global.utoutlookQuitting') &&
              block.includes('!global.restartRequested') &&
              block.includes('!global.skipCleanExitFlag'),
        'quit, restart and rotation guards must all be present (v4.1.0/v4.3.1)');
    assert.ok(block.includes('wrapperMisses >= 4') && block.includes('heartbeatTicks % 5 === 0'),
        'must require 3 consecutive misses spaced by 10 s (anti false positive)');
    assert.ok(block.includes("state === 'unknown'") || block.includes("// 'unknown'"),
        'unknown state must be explicitly ignored');
});

// ============================================================
// v4.3.7 — bouton diagnostics : rapport whiteliste, jamais de log brut
// ============================================================

test('v4.3.7: diagnostics report contains only structural, non-private data', async () => {
    const {buildDiagnostics} = await import('../src/diagnostics.mjs');
    const fake = {
        readFileSync: (p) => {
            if (String(p).endsWith('lang')) return 'fr\n';
            if (String(p).endsWith('render-mode')) return 'software\n';
            if (String(p).endsWith('follow')) return '42';
            throw new Error('ENOENT');
        },
        existsSync: (p) => String(p).endsWith('wrapper.pid'),
        statSync: () => ({size: 1234}),
    };
    const report = buildDiagnostics({
        version: '4.3.7', now: () => 1700000000000,
        configDir: '/cfg', dataDir: '/data', heartbeatFile: '/cfg/follow',
        readFileSync: fake.readFileSync, existsSync: fake.existsSync, statSync: fake.statSync,
    });
    assert.strictEqual(report.version, '4.3.7');
    assert.strictEqual(report.language, 'fr');
    assert.strictEqual(report.renderMode, 'software');
    assert.strictEqual(report.heartbeat, '42');
    assert.strictEqual(report.wrapperPidPresent, true);
    assert.strictEqual(report.socketPresent, false);
    assert.strictEqual(report.flags.exitclient, false);
    assert.strictEqual(report.logBytes.wrapper, 1234);
    const json = JSON.stringify(report);
    assert.ok(!/[a-z0-9._%+-]+@[a-z0-9.-]+/.test(json), 'no email address in the report');
    assert.ok(!json.includes('wrapper.log content'), 'no raw log content in the report');
});

test('v4.3.7: diagnostics IPC is guarded and the button uses i18n labels', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const preload = fs.readFileSync(path.join(here, '../src/controller/preload.js'), 'utf-8');
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');
    const i18n = fs.readFileSync(path.join(here, '../src/i18n.mjs'), 'utf-8');

    assert.ok(ctl.includes('ipcMain.handle("get-diagnostics"') &&
              ctl.includes('MailWindowController.byWebContents.has(event.sender)'),
        'only the trusted mail renderer may request diagnostics');
    assert.ok(ctl.includes('buildDiagnostics({version: app.getVersion()})'),
        'diagnostics must use the whitelisted builder');
    const diagnosticsHandler = ctl.slice(ctl.indexOf('ipcMain.handle("get-diagnostics"'),
                                          ctl.indexOf('ipcMain.handle("get-diagnostics"') + 900);
    assert.ok(!diagnosticsHandler.includes('wrapper.log'),
        'raw wrapper.log must never be exported');
    assert.ok(preload.includes('getDiagnostics: () => ipcRenderer.invoke("get-diagnostics")'),
        'preload must expose the diagnostics bridge');
    const sheet = fs.readFileSync(path.join(here, '../public/settings-sheet.js'), 'utf-8');
    assert.ok(sheet.includes("tr('actionDiagnostics'") &&
              sheet.includes("tr('diagnosticsSaved'") &&
              sheet.includes('getDiagnostics()'),
        'diagnostics now lives in the settings sheet (v4.4.5)');
    assert.ok(ctl.includes('actionDiagnostics: tr[\'action.diagnostics\']') &&
              ctl.includes('diagnosticsSaved: tr[\'diagnostics.saved\']'),
        'controller must inject the flat keys used by settings-sheet.js');
    assert.ok(i18n.includes("'action.diagnostics':") && i18n.includes("'diagnostics.saved':"),
        'new i18n keys must exist');
});

// ============================================================
// v4.3.7 — preparation Content Hub (validation de chemin, sans device)
// ============================================================

test('v4.3.7: content hub paths are whitelisted before reaching Outlook', async () => {
    const {normalizeContentUrl, validateTransferPath, TRANSFER_TIMEOUT_MS, MAX_TRANSFER_BYTES} =
        await import('../src/content-hub.mjs');
    assert.strictEqual(TRANSFER_TIMEOUT_MS, 30000);
    assert.strictEqual(normalizeContentUrl('file:///home/phablet/Download/a%20b.pdf'),
        '/home/phablet/Download/a b.pdf');
    assert.strictEqual(normalizeContentUrl('file:/tmp/x.txt'), '/tmp/x.txt');
    assert.strictEqual(normalizeContentUrl(null), null);

    const fsApi = {
        statSync: (p) => {
            if (p.includes('missing')) throw new Error('ENOENT');
            return {isFile: () => !p.endsWith('/')};
        },
    };
    const opts = {allowedRoots: ['/home/phablet/Downloads'], fsApi};
    assert.deepStrictEqual(
        validateTransferPath('file:///home/phablet/Downloads/plan%20velo.pdf', opts),
        {ok: true, path: '/home/phablet/Downloads/plan velo.pdf'});
    assert.deepStrictEqual(
        validateTransferPath('/home/phablet/Downloads/../../etc/passwd', opts),
        {ok: false, reason: 'outside-allowed-roots'},
        'path traversal must be rejected');
    assert.deepStrictEqual(
        validateTransferPath('/home/phablet/Documents/secret.pdf', opts),
        {ok: false, reason: 'outside-allowed-roots'});
    assert.deepStrictEqual(
        validateTransferPath('/home/phablet/Downloads/missing.pdf', opts),
        {ok: false, reason: 'not-readable'});
    assert.deepStrictEqual(
        validateTransferPath('relative/file.pdf', opts),
        {ok: false, reason: 'invalid-path'});
    assert.deepStrictEqual(
        validateTransferPath('/home/phablet/Downloads/gros.pdf', {
            allowedRoots: ['/home/phablet/Downloads'],
            fsApi: {statSync: () => ({isFile: () => true, size: MAX_TRANSFER_BYTES + 1})},
        }),
        {ok: false, reason: 'too-large'},
        'a huge file must be rejected before base64 injection (v4.4.2)');
});

test('v4.3.7: Content Hub is wired via D-Bus, with no visible QML picker', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const clickDir = path.resolve(here, '../..');
    const qmlDir = path.join(clickDir, 'qml');
    const manifest = fs.readFileSync(path.join(clickDir, 'manifest.json'), 'utf-8');
    const apparmor = fs.readFileSync(path.join(clickDir, 'utoutlook.apparmor'), 'utf-8');
    const hook = fs.readFileSync(path.join(clickDir, 'content-hub.json'), 'utf-8');

    assert.ok(manifest.includes('content-hub'), 'content-hub hook must stay declared');
    assert.ok(apparmor.includes('content_exchange') && apparmor.includes('content_exchange_source'));
    assert.ok(JSON.parse(hook).source.length > 0, 'source content types must be declared');
    const qmlFiles = fs.readdirSync(qmlDir).filter(f => f.endsWith('.qml'));
    const withPicker = qmlFiles.filter(f =>
        fs.readFileSync(path.join(qmlDir, f), 'utf-8').includes('ContentPeerPicker'));
    assert.deepStrictEqual(withPicker, [],
        'no visible QML picker yet — a separate QML window creates unknown.qtmir (§2.14)');
});

// ============================================================
// v4.4 — pont D-Bus Content Hub (import de pieces jointes)
// ============================================================

test('v4.4: Content Hub D-Bus replies are parsed without a QML picker', async () => {
    const {parsePeers, parseObjectPath, parseCollectedUrls, DEFAULT_ALLOWED_ROOTS} =
        await import('../src/content-hub.mjs');
    const peers = parsePeers("('filemanager.ubports_filemanager_1.1.4', 'Fichiers', @ay [...], '', false)");
    assert.deepStrictEqual(peers, [{id: 'filemanager.ubports_filemanager_1.1.4', name: 'Fichiers'}]);
    assert.strictEqual(parseObjectPath("(objectpath '/transfers/utoutlook/import/1',)"),
        '/transfers/utoutlook/import/1');
    assert.deepStrictEqual(parseCollectedUrls("([<('file:///home/phablet/Downloads/a%20b.pdf')>])"),
        ['file:///home/phablet/Downloads/a%20b.pdf']);
    // v4.5.5: dbus-send --print-reply (pas d'Introspect, autorise par AppArmor)
    const dbusSendPeers = parsePeers('   variant struct {\n      string "filemanager.ubports_filemanager_1.1.4"\n      string "Fichiers"\n');
    assert.deepStrictEqual(dbusSendPeers, [{id: 'filemanager.ubports_filemanager_1.1.4', name: 'Fichiers'}]);
    assert.strictEqual(parseObjectPath('   objectpath "/transfers/utoutlook/import/1"\n'),
        '/transfers/utoutlook/import/1');
    assert.deepStrictEqual(parseCollectedUrls('      string "file:///home/phablet/Downloads/a.pdf"\n'),
        ['file:///home/phablet/Downloads/a.pdf']);
    assert.ok(DEFAULT_ALLOWED_ROOTS.some(r => r.endsWith('/.cache/utoutlook.mathias/HubIncoming')),
        'files really received via Content Hub land in the app cache (v4.4.2, path from config.mjs)');
    assert.ok(!DEFAULT_ALLOWED_ROOTS.some(r => r.startsWith('/home/phablet/')) ||
              process.env.HOME === '/home/phablet',
        'no hardcoded /home/phablet outside the device (v4.4.2)');
});

test('v4.4: importFiles drives Start/Collect/Finalize and validates the path', async () => {
    const {ContentHubBridge} = await import('../src/content-hub.mjs');
    const calls = [];
    const run = async (args) => {
        // v4.5.6: dbus-send exige --dest=NAME / --type=TYPE (forme avec '=')
        assert.ok(args.includes(`--dest=com.lomiri.content.dbus.Service`) &&
                  args.includes('--type=method_call'),
            'dbus-send arguments must use the --opt=value form (v4.5.6)');
        const method = args[args.indexOf('--print-reply') + 2];
        calls.push(method);
        if (method.endsWith('KnownSourcesForType')) {
            return "([<('filemanager.ubports_filemanager_1.1.4', 'Fichiers')>], '')";
        }
        if (method.endsWith('CreateImportFromPeer')) return "(objectpath '/transfers/x/import/1',)";
        if (method.endsWith('Collect')) return "([<('file:///home/phablet/.cache/utoutlook.mathias/HubIncoming/1/plan.pdf')>])";
        return '()';
    };
    const bridge = new ContentHubBridge({
        run,
        appId: 'utoutlook.mathias_utoutlook_4.4.0',
        sleep: async () => {},
        now: (() => { let n = 0; return () => (n += 100); })(),
        validate: (raw) => ({ok: true, path: raw}),
    });
    const result = await bridge.importFiles();
    assert.deepStrictEqual(result,
        {paths: ['/home/phablet/.cache/utoutlook.mathias/HubIncoming/1/plan.pdf']});
    assert.ok(calls.some(c => c.endsWith('.Start')) && calls.some(c => c.endsWith('.Finalize')),
        'the transfer must be started and finalized');
});

// ============================================================
// v4.3.7 — ecran hors-ligne natif (pas de QML separe)
// ============================================================

test('v4.3.7: two consecutive failures are required before the offline screen', async () => {
    const {shouldShowOfflineScreen, STARTUP_NETWORK_CHECKS} =
        await import('../src/network-check.mjs');
    assert.strictEqual(STARTUP_NETWORK_CHECKS, 2);
    assert.strictEqual(shouldShowOfflineScreen(0), false);
    assert.strictEqual(shouldShowOfflineScreen(1), false, 'one slow network must not block startup');
    assert.strictEqual(shouldShowOfflineScreen(2), true);
    assert.strictEqual(shouldShowOfflineScreen(3), true);
});

test('v4.3.7: offline screen is native Electron and survives a hidden window', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    assert.ok(ctl.includes('this.startStartupNetworkCheck()'),
        'startup network check must be wired at window setup');
    const block = ctl.slice(ctl.indexOf('startStartupNetworkCheck()'));
    assert.ok(block.includes("this.showOfflineOverlay('offline')") &&
              block.includes('this.startConnectivityMonitor()'),
        'offline screen must use the native overlay and keep polling for recovery');
    assert.ok(!block.slice(0, 1800).includes('qmlscene'),
        'no separate QML window for offline (yellow icon rule §2.14)');
    assert.ok(ctl.includes('if (document.body) inject();') &&
              ctl.includes("addEventListener('DOMContentLoaded'"),
        'overlay injection must wait for the DOM at startup');
    assert.ok(ctl.includes('if (this.isBackgrounded() && !this.isOffline) return;'),
        'recovery poll must keep running while the offline screen is displayed');
});

// ============================================================
// v4.4.9 — barre hors du clavier pendant la composition
// ============================================================

test('v4.5.4: a file passed by Content Hub is consumed into the composer', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const preload = fs.readFileSync(path.join(here, '../src/controller/preload.js'), 'utf-8');
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');

    assert.ok(ctl.includes('"consume-pending-attachment"') && ctl.includes('PENDING_ATTACH_FILE'),
        'main must consume the pending attachment file (v4.5.4)');
    assert.ok(preload.includes('consumePendingAttachment'),
        'preload must expose the pending attachment bridge (v4.5.4)');
    assert.ok(btn.includes('consumePendingAttachment()'),
        'renderer must request it when a compose window opens (v4.5.4)');
});

test('v4.5.3: the click declares both source and destination to Content Hub', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const hub = JSON.parse(fs.readFileSync(path.join(here, '../../content-hub.json'), 'utf-8'));
    const cmd = fs.readFileSync(path.join(here, '../../command.sh'), 'utf-8');

    assert.ok(Array.isArray(hub.source) && hub.source.length > 0 &&
              Array.isArray(hub.destination) && hub.destination.length > 0,
        'UToutlook must be declared as both source and destination (v4.5.3)');
    assert.ok(cmd.includes('pending-attach'),
        'arguments passed by Content Hub must be saved for the renderer (v4.5.3)');
});

test('v4.5.2: attach-from-hub validates the renderer origin, not the controller map', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const start = ctl.indexOf('ipcMain.handle("attach-from-hub"');
    const block = ctl.slice(start, start + 1200);
    assert.ok(block.includes('event.sender.getURL') && block.includes('trusted'),
        'attach must accept a trusted Outlook origin even if byWebContents lost the sender (v4.5.2)');
});

test('v4.5.1: attach/get-diagnostics are not removed by another controller destroy', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');
    const start = ctl.indexOf('this._ipcHandleChannels = ');
    const list = ctl.slice(start, start + 260);
    assert.ok(list.includes('get-render-mode') && list.includes('first-install'),
        'legacy handlers still cleaned up');
    assert.ok(!list.includes('attach-from-hub') && !list.includes('get-diagnostics'),
        'global removeHandler must not kill the active controller handler (v4.5.1)');
});

test('v4.5.0: the bar stays at the top for the whole compose window', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');

    assert.ok(btn.includes('const COMPOSE_SEL') &&
              btn.includes("bar.style.top = '12px'") &&
              btn.includes("bar.style.bottom = 'auto'"),
        'the bar must move to the top while a compose window exists (v4.5.0)');
    assert.ok(btn.includes('setInterval') && btn.includes('composing && !barTop') &&
              !btn.includes("document.addEventListener('focusout'"),
        'the bar must not drop back on focus loss when tapping attach (v4.5.0)');
});

// ============================================================
// v4.4.8 — cible d'injection PJ = menu « Fichier » d'Outlook
// ============================================================

test('v4.4.8: attach targets the hidden Outlook file input used by the File menu', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    assert.ok(btn.includes('owaMailComposeEditorScrollContainer') &&
              btn.includes('docking_InitVisiblePart_'),
        'compose detection must use the editor container, not a visible file input (v4.4.8)');
    assert.ok(ctl.includes('local-computer-filein') &&
              ctl.includes("getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set"),
        'injection must target Outlook file input and use the native setter (v4.4.8)');
});

// ============================================================
// v4.4.7 — barre au-dessus du clavier virtuel
// ============================================================

test('v4.4.7: action bar and overlays move above the on-screen keyboard', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');
    const sheet = fs.readFileSync(path.join(here, '../public/settings-sheet.js'), 'utf-8');

    assert.ok(btn.includes('const keyboardOverlap') &&
              btn.includes("bar.style.bottom = (12 + keyboardOverlap()) + 'px'") &&
              btn.includes("visualViewport?.addEventListener('resize'"),
        'the bar must be repositioned when the OSK resizes the viewport (v4.4.7)');
    assert.ok(sheet.includes('document.activeElement.blur') && sheet.includes('panel.style.bottom = overlap'),
        'settings sheet must dismiss the keyboard and stay above it (v4.4.7)');
});

// ============================================================
// v4.4.6 — retours UI des reglages
// ============================================================

test('v4.4.6: render selection updates immediately and attach is compose-only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sheet = fs.readFileSync(path.join(here, '../public/settings-sheet.js'), 'utf-8');
    const btn = fs.readFileSync(path.join(here, '../public/reload-button.js'), 'utf-8');

    assert.ok(sheet.includes('const markActive') && sheet.includes('markActive(mode)') &&
              sheet.includes('aria-pressed'),
        'selected render mode must change visually on click (v4.4.6)');
    assert.ok(sheet.includes('toast(confirmText)') && sheet.includes('commonUnavailable'),
        'first-install confirmation must be visible (v4.4.6)');
    assert.ok(btn.includes('const composeFileInput') &&
              btn.includes("attachEl.style.display = composeFileInput() ? '' : 'none'"),
        'attach button must only appear when a compose file input exists (v4.4.6)');
});

// ============================================================
// v4.4.1 — durcissement confidentialite
// ============================================================

test('v4.4.1: unused media permissions are removed from the click', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const apparmor = fs.readFileSync(path.join(here, '../../utoutlook.apparmor'), 'utf-8');
    const groups = JSON.parse(apparmor).policy_groups;
    for (const unused of ['audio', 'video', 'microphone', 'camera']) {
        assert.ok(!groups.includes(unused), `${unused} is not used by the app (v4.4.1)`);
    }
    assert.ok(groups.includes('webview') && groups.includes('content_exchange'),
        'required groups must stay');
});

test('v4.4.1: renderer console and URLs are redacted in release logs', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const ctl = fs.readFileSync(path.join(here, '../src/controller/mail-window-controller.mjs'), 'utf-8');

    assert.ok(ctl.includes('function safeUrl(') && ctl.includes('${u.origin}${u.pathname}'),
        'logged URLs must keep origin+path only (v4.4.1)');
    const rawUrlLogs = ctl.split('\n').filter(l =>
        l.includes('logger.') && /\$\{(url|validatedURL)\}/.test(l));
    assert.deepStrictEqual(rawUrlLogs, [], 'no logger may print a raw login URL');

    assert.ok(ctl.includes("process.env.UTOUTLOOK_DEBUG === '1'") &&
              ctl.includes('sanitizeConsole(message)') &&
              ctl.includes('SAFE_CONSOLE_RE'),
        'full renderer console output must be debug-only (v4.4.1)');
});
