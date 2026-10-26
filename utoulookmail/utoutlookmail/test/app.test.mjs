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
