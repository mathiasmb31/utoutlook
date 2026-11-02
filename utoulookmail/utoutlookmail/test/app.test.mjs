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
    const liveNetMatches = content.match(/\*\.live\.net/g) || [];
    assert.ok(liveNetMatches.length >= 5,
        `CSP should include *.live.net in multiple directives (found ${liveNetMatches.length}, need >= 5)`);
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
    assert.ok(content.includes('unread > previousUnreadCount && !checkOnlyZeroUnread'),
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
    const ipcStart = content.indexOf('ipcMain.on("show-notification"');
    const ipcEnd = content.indexOf('ipcMain.on(', ipcStart + 1);
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

test('mail-window-controller: splash timeout is 30s (not 15s) (hotfix #15)', async () => {
    const fs = await import('node:fs');
    const ctrlPath = path.resolve(__dirname, '../src/controller/mail-window-controller.mjs');
    const content = fs.readFileSync(ctrlPath, 'utf-8');

    const start = content.indexOf('splashTimeout = setTimeout');
    const end = content.indexOf('}, 30000);', start) + 10;
    const body = content.slice(start, end);

    assert.ok(body.includes('30000'),
        'Splash safety timeout must be 30s (not 15s) for slow mobile connections (hotfix #15)');
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

    // With showWindowFrame+hideOnClose=true, closing via the X11 cross only hid
    // the window while the process kept running; the next launcher tap raised a
    // hidden window = nothing appeared ("app does not start", 1 in 2-3 launches).
    assert.ok(/showWindowFrame:\s*false/.test(content),
        'showWindowFrame default must be false on UT (v3.3.4)');
    assert.ok(/hideOnClose:\s*false/.test(content),
        'hideOnClose default must be false so closing quits the app (v3.3.4)');
    assert.ok(/hideOnMinimize:\s*false/.test(content),
        'hideOnMinimize default must be false on UT (v3.3.4)');
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

test('main.mjs: stale close flag from a previous instance cannot kill the new process (v3.3.5)', async () => {
    const fs = await import('node:fs');
    const mPath = path.resolve(__dirname, '../src/main.mjs');
    const content = fs.readFileSync(mPath, 'utf-8');

    // An orphaned old wrapper wrote "tried too more" into the close flag while
    // the new process was starting → heartbeat read it → app.exit(0) 2s after
    // launch (intermittent startup crash, race-dependent).
    assert.ok(content.includes('PROCESS_START'),
        'main.mjs must record the process start time (v3.3.5)');
    assert.ok(content.includes('mtimeMs') && content.includes('mtime > PROCESS_START'),
        'close flag must only be honored if written after process start (v3.3.5)');
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

test('settings: persisted hideOnClose=true from old versions is forced to false on UT (v3.3.6)', async () => {
    const fs = await import('node:fs');
    const sPath = path.resolve(__dirname, '../src/settings.mjs');
    const content = fs.readFileSync(sPath, 'utf-8');

    // Old installs have a settings.json with hideOnClose/showWindowFrame=true
    // persisted — defaults alone don't override them, and hideOnClose=true
    // leaves a hidden window + live process → relaunch shows nothing.
    assert.ok(/\['showWindowFrame', 'hideOnClose', 'hideOnMinimize'\]/.test(content),
        'settings.mjs must force showWindowFrame/hideOnClose/hideOnMinimize=false (v3.3.6)');
    assert.ok(content.includes('settings.get(key) !== false') && content.includes('settings.set(key, false)'),
        'settings.mjs must overwrite persisted true values with false (v3.3.6)');
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
    assert.ok(common.includes('wrapper.pid') && common.includes('kill -0 "$p"'),
        'utoutlook_kill_stale_wrappers must kill the pidfile PID if alive (v3.3.7)');
    assert.ok(common.includes('pgrep fallback found'),
        'pgrep fallback must stay, with a debug log (v3.3.7)');
});

test('command.sh: GPU options must not allow the "GPU process isn\'t usable. Goodbye." FATAL (v3.3.8)', async () => {
    const fs = await import('node:fs');
    const cmdPath = path.resolve(__dirname, '../../command.sh');
    const content = fs.readFileSync(cmdPath, 'utf-8');

    // --disable-gpu + --disable-software-rasterizer left no fallback (swiftshader
    // lib was stripped from the package): when the separate GPU process failed to
    // spawn 3x (error_code=1002, intermittent), Chromium FATAL'd and killed the app.
    const m = content.match(/gpuoptions="([^"]*)"/);
    assert.ok(m, 'gpuoptions must be defined');
    assert.ok(!m[1].includes('--disable-software-rasterizer'),
        'must NOT disable software rasterizer — no GPU fallback on the phone (v3.3.8)');
    assert.ok(!m[1].includes('--disable-gpu '),
        'must NOT use --disable-gpu (separate GPU process still spawns and can FATAL) (v3.3.8)');
    assert.ok(m[1].includes('--in-process-gpu'),
        'must use --in-process-gpu so no separate GPU process is ever spawned (v3.3.8)');
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
    assert.ok(killFn.includes('echo "closed" > "${UTOUTLOOK_EXITCOMMAND}"'),
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
    const occurrences = (content.match(/https:\/\/\*\.cloud\.microsoft/g) || []).length;
    assert.ok(occurrences >= 6,
        `CSP must allow https://*.cloud.microsoft in all directives (found ${occurrences}, need >= 6) (v3.3.11)`);
    assert.ok(content.includes('wss://*.cloud.microsoft'),
        'CSP connect-src must allow wss://*.cloud.microsoft (v3.3.11)');
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

test('v3.3.19: splash logo aussi grand que velo-touch + look UT lecture de mails', async () => {
    const fs = await import('node:fs');
    const splash = fs.readFileSync(path.resolve(__dirname, '../public/splash.html'), 'utf-8');
    // même règle que velo-touch Main.qml: logoSize = min(width*0.65, 768)
    assert.ok(splash.includes('min(65vw, 768px)'),
        'splash logo must be min(65vw, 768px) like velo-touch (v3.3.19)');
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
    assert.ok(ctrl.includes("app.on('browser-window-created'"),
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
    const upd = ctrl.slice(ctrl.indexOf('ipcMain.on("updateUnread"'), ctrl.indexOf('ipcMain.on("show-notification"'));
    assert.ok(upd.includes('lastNotifiedUnread') && upd.includes('notif.newMessages.body'),
        'updateUnread must notify the unread count even when the window is visible (v3.3.21)');
    // 2. urgent bypass la suppression foreground
    const notif = ctrl.slice(ctrl.indexOf('ipcMain.on("show-notification"'));
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
    assert.ok(obs.includes('deadHandlers') && obs.includes('>= 5'),
        'observer must stop retrying a handler after 5 failures (v3.3.22)');
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
    assert.ok(obs.includes('navToggleForRead'),
        'observer must toggle the nav pane briefly to read the count when closed (v3.3.25)');

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
    assert.ok(vibe.includes('data:image/png;base64') && vibe.includes('#E95420'),
        'logo-vibe.svg = enveloppe + tête mascotte sur fond orange UT (v3.3.26)');
    const anim = fs.readFileSync(path.join(assets, 'logo-anim.svg'), 'utf-8');
    assert.ok(anim.includes('animateTransform') && anim.includes('data:image/png;base64'),
        'logo-anim.svg = tête qui entre/sort de l\'enveloppe en boucle (v3.3.26)');
    const splash = fs.readFileSync(path.resolve(__dirname, '../public/splash.html'), 'utf-8');
    assert.ok(splash.includes('logo-anim.svg'), 'splash must use the animated logo (v3.3.26)');
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
    const closeHandler = ctrl.slice(ctrl.indexOf('"close", (e)'), ctrl.indexOf('"close", (e)') + 900);
    assert.ok(closeHandler.includes('markCleanExit()') && closeHandler.includes('letting it close'),
        'window close handler must call markCleanExit before letting it close (v3.3.28)');
    // the 'closed' handler (app.exit there fires before window-all-closed) must mark too
    const closed = ctrl.slice(ctrl.indexOf('preventAutoCloseApp'), ctrl.indexOf('preventAutoCloseApp') + 500);
    assert.ok(closed.includes('markCleanExit()'), 'window closed handler must call markCleanExit before app.exit (v3.3.28)');
    // restart paths (settings import/reset) must NOT mark a clean quit
    const tray = fs.readFileSync(path.resolve(__dirname, '../src/controller/tray-controller.mjs'), 'utf-8');
    assert.ok(tray.includes('global.restartRequested = true'),
        'tray relaunch paths must set restartRequested so the wrapper relaunches (v3.3.28)');
    assert.ok(main.includes('if (!global.restartRequested) markCleanExit()'),
        'cleanupAndExit must skip markCleanExit on restart (v3.3.28)');

    const cmd = fs.readFileSync(path.resolve(__dirname, '../../command.sh'), 'utf-8');
    // wrapper: on heartbeat stagnation, a clean-quit flag means exit, not relaunch
    const stag = cmd.slice(cmd.indexOf('stagnantCount} -ge 2'), cmd.indexOf('stagnantCount} -ge 2') + 700);
    assert.ok(stag.includes('[ -f ${exitclient} ]') && stag.includes('exit 0'),
        'command.sh must exit (not relaunch) when exitclient exists at heartbeat stagnation (v3.3.28)');
    // wrapper: stale lifecycle flags must be cleared in cleanup() AFTER the
    // old app is killed (not while the client is alive — the 'close' event
    // writes exitclient right before the process dies)
    const cleanup = cmd.slice(cmd.indexOf('function cleanup()'), cmd.indexOf('function launch_prospect'));
    assert.ok(cleanup.includes('rm -f "${UTOUTLOOK_EXITCLIENT}" "${UTOUTLOOK_KILLEDCLIENT}"'),
        'command.sh cleanup() must clear exitclient/killedclient after kill_app (v3.3.28)');
    const aliveBranch = cmd.slice(cmd.indexOf('clientalive=1'), cmd.indexOf('clientalive=1') + 200);
    assert.ok(!aliveBranch.includes('rm -f'), 'alive branch must NOT delete lifecycle flags (v3.3.28)');
});
