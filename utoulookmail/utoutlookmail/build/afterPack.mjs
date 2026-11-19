// afterPack.mjs — Nettoyage post-build Electron pour réduire la taille du click
// Supprime les fichiers inutiles sur Ubuntu Touch (GPU désactivé, sandbox désactivé,
// seules les locales FR/EN nécessaires).

import { rmSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const isArm64 = context.arch === 'arm64';

  let saved = 0;
  const log = (msg) => console.log(`[afterPack] ${msg}`);

  const tryRemove = (relPath) => {
    const full = join(appOutDir, relPath);
    if (existsSync(full)) {
      try {
        rmSync(full, { force: true, recursive: true });
        log(`Removed: ${relPath}`);
      } catch (e) {
        log(`WARN: could not remove ${relPath}: ${e.message}`);
      }
    }
  };

  // --- Fichiers inutiles sur UT (--no-sandbox) ---
  tryRemove('LICENSES.chromium.html');       // 20 Mo — licences, inutile en prod
  tryRemove('LICENSE.electron.txt');          // licence Electron, inutile
  // v4.0.127: CONSERVER SwiftShader + Vulkan (~20 Mo). Le wrapper peut
  // basculer automatiquement en rendu logiciel après un crash GPU
  // (utoutlook_resolve_render_mode) — sans ces libs, --use-angle=swiftshader
  // n'a aucun backend et l'écran reste transparent sur les modèles affectés.
  tryRemove('chrome_crashpad_handler');       // 1.8 Mo — crash reporter
  tryRemove('chrome-sandbox');                // sandbox Chromium (--no-sandbox)

  // --- Locales : ne garder que FR et EN ---
  const localesDir = join(appOutDir, 'locales');
  if (existsSync(localesDir)) {
    const keep = new Set(['fr.pak', 'en-US.pak']);
    for (const file of readdirSync(localesDir)) {
      if (!keep.has(file)) {
        try {
          unlinkSync(join(localesDir, file));
        } catch (e) {
          log(`WARN: could not remove locale ${file}: ${e.message}`);
        }
      }
    }
    log(`Locales cleaned: kept only fr.pak and en-US.pak`);
  }

  log('Cleanup complete.');
}
