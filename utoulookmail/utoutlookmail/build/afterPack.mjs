// afterPack.mjs — Nettoyage post-build Electron pour réduire la taille du click
// Supprime les fichiers inutiles sur Ubuntu Touch (GPU désactivé, sandbox désactivé,
// seules les locales FR/EN nécessaires).

import { rmSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function afterPack(context) {
  const appOutDir = context.appOutDir;
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

  // v4.1.0 (revue F22): CONSERVER les textes de licence — obligations de
  // redistribution BSD/Chromium et MIT/Electron, y compris pour OpenStore.
  // v4.0.127: CONSERVER SwiftShader + Vulkan (~20 Mo). Le wrapper peut
  // basculer automatiquement en rendu logiciel après un crash GPU
  // (utoutlook_resolve_render_mode) — sans ces libs, --use-angle=swiftshader
  // n'a aucun backend et l'écran reste transparent sur les modèles affectés.
  tryRemove('chrome_crashpad_handler');       // 1.8 Mo — crash reporter
  tryRemove('chrome-sandbox');                // sandbox Chromium (--no-sandbox)

  // v4.1.0 (revue F23): seules les chaînes applicatives sont i18n (src/i18n.mjs,
  // 8 langues) ; les chaînes natives Electron/Chromium restent en anglais.
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
