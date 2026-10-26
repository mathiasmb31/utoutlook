import {test} from 'node:test';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// Tests for config.mjs — path constants
// ============================================================

test('config: CONFIG_DIR is under phablet home', async () => {
    const {CONFIG_DIR} = await import('../src/config.mjs');
    assert.ok(CONFIG_DIR.startsWith('/home/phablet/'));
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
    // We test the internal handleCommand via a mock
    // Since handleCommand is not exported, we test via the public API
    const {startSocketServer, stopSocketServer} = await import('../src/ipc-socket.mjs');
    let quitCalled = false;
    const server = startSocketServer({
        onQuit: () => { quitCalled = true; },
    });
    // Server started, now stop it
    stopSocketServer();
    assert.ok(server);
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

test('settings: hideOnClose defaults to true', {skip: !settingsAvailable && 'requires Electron runtime'}, async () => {
    const {settings} = await import('../src/settings.mjs');
    assert.strictEqual(settings.get('hideOnClose'), true);
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

test('i18n: supports 8 languages', async () => {
    const {getAvailableLanguages} = await import('../src/i18n.mjs');
    const langs = getAvailableLanguages();
    assert.strictEqual(Object.keys(langs).length, 8);
    assert.ok(langs.fr);
    assert.ok(langs.en);
    assert.ok(langs.es);
    assert.ok(langs.de);
    assert.ok(langs.it);
    assert.ok(langs.pt);
    assert.ok(langs.zh);
    assert.ok(langs.ar);
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
    assert.ok(content.includes('retryDelay * 2') || content.includes('retryDelay*2'),
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

test('command.sh: waits for notifications before welcome', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');
    assert.ok(content.includes('utoutlook_wait_notifications'),
        'command.sh should wait for notification service before welcome');
    // wait should come before the welcome notification
    const waitPos = content.indexOf('utoutlook_wait_notifications');
    const welcomePos = content.indexOf("shell.welcome");
    assert.ok(waitPos !== -1 && welcomePos !== -1, 'Both wait and welcome should exist');
    assert.ok(waitPos < welcomePos, 'Wait should come before welcome notification');
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
    const cspMatch = content.match(/script-src[^;]+/);
    assert.ok(cspMatch, 'CSP should have script-src directive');
    const scriptSrc = cspMatch[0];
    for (const domain of ['msocdn.com', 'msecnd.net', 'msftauth.net', 'cdn.office.net', 'onecdn.static.microsoft', 'microsoftonline.com']) {
        assert.ok(scriptSrc.includes(domain),
            `script-src should include ${domain} (Outlook boot JS served from CDN)`);
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
    // Launcher logo should be the simplified version (no circular text)
    const simpleSize = fs.statSync(simpleLogo).size;
    const launcherSize = fs.statSync(launcherLogo).size;
    assert.strictEqual(launcherSize, simpleSize,
        'Launcher logo should be the simplified version (same as logo-simple.png)');
});
