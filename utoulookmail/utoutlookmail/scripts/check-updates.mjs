// check-updates.mjs — vérifie avant chaque build que le projet utilise les
// dernières versions stables de Node.js et Electron (registre npm public).
// Informatif uniquement : n'échoue jamais le build (une majeure neuve doit
// être testée sur appareil avant adoption).
import fs from 'node:fs';
import path from 'node:path';
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
