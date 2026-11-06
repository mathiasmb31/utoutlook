// check-updates.mjs — vérifie avant chaque build que le projet utilise les
// dernières versions stables de Node.js et Electron (registre npm public).
// Si une version plus récente existe, propose de mettre à jour Electron
// (confirmation interactive, défaut NON). N'échoue jamais le build.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

async function latestFromNpm(name) {
    const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
        headers: {'accept': 'application/json'},
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).version;
}

// Dernière version LTS de Node.js (le tag npm "latest" du package node pointe
// vers une alpha — la source fiable est https://nodejs.org/dist/index.json).
async function latestNodeLts() {
    const r = await fetch('https://nodejs.org/dist/index.json', {
        headers: {'accept': 'application/json'},
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = await r.json();
    const lts = list.find(v => v.lts); // index.json est trié du plus récent au plus ancien
    return lts ? lts.version : list[0].version;
}

function major(v) { return parseInt(String(v).replace(/^[^0-9]*/, ''), 10); }

// Demande oui/non avec timeout (défaut NON). En non-TTY (CI, build auto) →
// retourne false immédiatement pour ne jamais bloquer le build.
function ask(question, timeoutMs = 20000) {
    if (!process.stdin.isTTY) return Promise.resolve(false);
    return new Promise(resolve => {
        const rl = readline.createInterface({input: process.stdin, output: process.stdout});
        const timer = setTimeout(() => { rl.close(); resolve(false); }, timeoutMs);
        rl.question(question, answer => {
            clearTimeout(timer);
            rl.close();
            resolve(/^(o|oui|y|yes)$/i.test(answer.trim()));
        });
    });
}

let newMajor = false;
try {
    const electronSpec = (pkg.devDependencies && pkg.devDependencies.electron) || 'not set';
    let electronInstalled = 'not installed';
    try {
        electronInstalled = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, '../node_modules/electron/package.json'), 'utf-8')
        ).version;
    } catch { /* node_modules absent — build will install it */ }
    const electronLatest = await latestFromNpm('electron');
    console.log(`[check-updates] electron: spec=${electronSpec} installed=${electronInstalled} latest=${electronLatest}`);
    if (major(electronLatest) > major(electronInstalled)) newMajor = true;
    if (electronLatest !== electronInstalled && electronInstalled !== 'not installed') {
        const yes = await ask(`[check-updates] Update Electron ${electronInstalled} → ${electronLatest} now (npm install electron@${electronLatest} --save-dev) ? [y/N] `);
        if (yes) {
            console.log(`[check-updates] running: npm install electron@${electronLatest} --save-dev`);
            execFileSync('npm', ['install', `electron@${electronLatest}`, '--save-dev'], {
                cwd: path.resolve(__dirname, '..'),
                stdio: 'inherit',
            });
            console.log(`[check-updates] Electron updated to ${electronLatest} — rebuild will use it; test on device before release`);
        } else {
            console.log('[check-updates] update skipped (default: no) — continuing build with current version');
        }
    }

    const nodeLatest = await latestNodeLts();
    const nodeHost = process.version;
    const engines = (pkg.engines && pkg.engines.node) || 'not set';
    console.log(`[check-updates] node: host=${nodeHost} engines=${engines} latest=${nodeLatest}`);
    if (major(nodeLatest) > major(nodeHost)) {
        console.log(`[check-updates] node: NEW MAJOR on build host (${nodeLatest} vs ${nodeHost}) — host tooling only, app runtime Node is bundled by Electron`);
    }

    // Le Node du runtime app est celui embarqué par Electron (ex. 24.22 pour
    // Electron 45) — il monte automatiquement avec la version d'Electron.
    console.log(`[check-updates] done${newMajor ? ' — action suggested: evaluate Electron major upgrade' : ''}`);
} catch (e) {
    console.warn(`[check-updates] could not reach npm registry (${e.message}) — continuing build anyway`);
}
