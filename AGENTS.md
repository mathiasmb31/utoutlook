# AGENTS.md — Règles de travail

## Livraison / release (OBLIGATOIRE — règle de Mathias, 2026-11-02, par défaut pour TOUT nouveau projet)

Toute release publique d'une app est livrée dans `vibeworkspace/livraison/<app>-<version>/` :

- `utoutlook.mathias_X.Y.Z_arm64.click` (ou le .click de l'app) — commité avec `git add -f` (les .click sont gitignorés)
- **JAMAIS de push des .click sur un dépôt distant** (règle Mathias 2026-11-06, TOUS projets) : les .click sont reconstructibles (build reproductible), ils restent en **local uniquement** et ne partent jamais sur GitHub. Garde-fou : hook `githooks/pre-push` (activer avec `git config core.hooksPath githooks`) qui bloque tout push contenant un fichier `.click` ; procédure de push filtré documentée dans `base-de-connaissances/restauration-workspace-vibe-2026-11-06.md`. Garde-fou taille (2026-11-08) : `githooks/pre-commit` bloque tout fichier hors .click > 50 Mo au commit (`MAX_COMMIT_FILE_MB`), `githooks/pre-push` bloque tout blob > 100 Mo au push (`MAX_PUSH_FILE_MB`, limite dure GitHub).
- `CHANGELOG.md` — release notes en **anglais**, langage non-développeur, titré, condensé (pas 10 pages) ; couvre depuis la dernière release majeure connue
- `README.txt` (ou LISEZMOI.txt) — instructions d'installation (adb install / clickable install / transfert du .click), prérequis, nouveautés en 3 lignes
- Version synchronisée dans `manifest.json` ET `package.json` (si Electron) avant le build
- Pied de commit Vibe obligatoire sur le commit de livraison
- Ligne de crédit obligatoire dans le `CHANGELOG.md` **et** le `README.txt` de livraison : « Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias. » (règle Mathias, 2026-11-02, reformulée 2026-11-17) — jamais « validated by Vibe » (Vibe est l'outil, Mathias vérifie et teste)

## Internationalisation (OBLIGATOIRE — règle de Mathias, 2026-11-02, tous les projets d'app)

Tout projet d'app DOIT être internationalisé : **aucun texte visible par l'utilisateur en dur**
(UI, notifications, bulles, messages shell, pages statiques splash/offline/nonetwork/about,
titres de fenêtres). Tout passe par le catalogue i18n du projet.

- Langues minimum : les 8 de la convention transverse (FR, EN, ES, DE, IT, PT, ZH, AR).
- Couvre aussi : notifications push/D-Bus, messages shell (fonction t/i18n), pages statiques.
- Détection auto de la langue système, fallback FR.
- Avant commit : aucun texte utilisateur hardcodé — vérifier par grep des chaînes
  accentuées hors catalogue i18n.

## Confidentialité (OBLIGATOIRE — règle de Mathias, 2026-11-01)

**Ne jamais publier l'email ni le nom « Brethous »** — ni dans les commits/PR
(messages, auteurs, committers), ni dans le code, la doc, les logs, les captures,
les tickets. RIEN de publié ne doit contenir `brethous` (casse-insensible) ni
l'adresse associée.

- Avant chaque commit/PR : `grep -ri brethous --exclude-dir=.git .` et
  `git log --all --format='%ae %ce %B' | grep -i brethous` doivent être vides.
- Exception : les données strictement locales et non publiées (cookies sur le
  téléphone, logs locaux du device, scratchpad) peuvent les contenir.
- Si un nom/email perso apparaît dans un log ou une capture destiné à être
  publié : le masquer (`XXXX`) avant commit.

## Branches (OBLIGATOIRE)

**Ne jamais committer directement sur `main`.**

Toujours travailler dans une branche dédiée :

| Type | Format | Usage |
|------|--------|-------|
| Feature | `feature/<nom>` | Nouvelle fonctionnalité |
| Fix | `fix/<nom>` | Correction de bug |
| Hotfix | `hotfix/<nom>` | Correction urgente |
| Chore | `chore/<nom>` | Tâche diverses (docs, config, CI) |

### Workflow

```bash
# Créer une branche depuis main
git checkout main && git pull
git checkout -b feature/ma-fonctionnalite

# Travailler, committer, push
# ...

# Merger sur main via Pull Request (pas de push direct sur main)
```

### CI

- Les PR vers `main` déclenchent la CI (tests + lint + build)
- Ne merger que si la CI est verte

## Build — plafonnement du parallélisme (OBLIGATOIRE — crash OOM hôte 2026-11-04, 11,5 Go RAM)

Ne jamais lancer un build avec `nproc` jobs par défaut sur le hôte (8 cœurs / 11,5 Go) :
une compilation parallèle non plafonnée (6+ cc1plus via compiledeps.sh/dpkg-buildpackage)
a provoqué OOM + figeage total le 2026-11-04.

- Build isolé : `-j4` max par défaut (`build-fast.sh`, `MAKEFLAGS`, `CMAKE_BUILD_PARALLEL_LEVEL`)
- Builds concurrents (build-all.sh) : `-j2` par projet (total ≤ 6 jobs)
- `compiledeps.sh` : `MAKEFLAGS=-j2` + `DEB_BUILD_OPTIONS="nocheck parallel=2"` (déjà en place)
- Surcharge ponctuelle possible (`./build-fast.sh N`, `make jobs=N`) en surveillant `free -h`


## Identité d'app Ubuntu Touch (OBLIGATOIRE — règle Mathias, 2026-11-19, TOUTES apps)

**Ne PAS personnaliser l'identité de la fenêtre** : ni `--class`, ni `StartupWMClass`, ni `app.setDesktopName("<id d'app>")` (la valeur historique `"UToutlookmail"` est conservée, c'est une chaîne libre). Ces 3 réglages ajoutés en v4.1.0 ont créé l'icône jaune `unknown.qtmir` ; retour à l'état v4.0.98 en v4.2.3. Watchdog préservé (lancement en `&`, pas `exec`). Voir `base-de-connaissances/ubuntu-touch-commun.md` §2.14 et fiche addendum 22:15.

## Build manuel (OBLIGATOIRE — règle Mathias, 2026-11-17)

**Ne jamais lancer de build depuis l'agent IA** (économie de tokens/API) : Mathias fait les builds lui-même via les scripts `build-deploy.sh` / `build-fast.sh` du projet. L'agent prépare le code, les tests et les scripts ; Mathias lance le build + déploiement + test device.

## Publication OpenStore (OBLIGATOIRE — règle Mathias, 2026-11-17)

**L'agent IA ne lance JAMAIS `openstore-prepare.sh --upload` ni aucun upload OpenStore : c'est Mathias qui exécute la commande à la main** (`OPENSTORE_APIKEY=... ./openstore-prepare.sh <version> --upload "OK"`, apikey en env var uniquement). L'agent peut seulement lire/préparer les fichiers du kit `publishstore/` et afficher les récap. Préalables : test device concluant (adb `71b90fee`, 0 crash) + « OK » explicite de Mathias après revue du contenu complet.

## Pied de commit (OBLIGATOIRE)

Tout commit fait par l'agent Mistral Vibe porte systématiquement ce pied de message :

```
Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.
Generated by Mistral Vibe & control by Mathias.
Assisted by DeepSeek V4.1 Flash Free, Hy4 flash Free and Mistral Large 4 (OpenCode) — reviewed and controlled by Mathias.
```

La ligne « Assisted by … » est autorisée quand le travail est fait avec ces modèles dans OpenCode (DeepSeek depuis 2026-11-18, Hy4 flash Free et Mistral Large 4 ajoutés le 2026-11-19) — on **ajoute** sans jamais retirer DeepSeek. La ligne `Co-Authored-By` a été **retirée le 2026-11-19** (décision Mathias) ; ce n'est pas un retour à l'ancien pied fautif de 2026-10-28, dont la ligne « Generated by Mistral Vibe. » reste interdite. Pied complet de référence : `vibeworkspace/AGENTS.md` §« Pied de commit ».

## Projet

UToutlook Mail — client Outlook pour Ubuntu Touch (Electron + click package).

- Source Electron : `utoulookmail/utoutlookmail/`
- Package click : `utoulookmail/` (command.sh, clickable.yaml, compiledeps.sh)
- Build : `cd utoulookmail/utoutlookmail && npm run dist:linux:targz && cd .. && clickable build`
- Test : `cd utoulookmail/utoutlookmail && npm test`
- Install sur device : `clickable install`

## Base de connaissances (OBLIGATOIRE — règle de Mathias, 2026-11-05, amendée 2026-11-06)

Toute session sur le téléphone (adb : install, test, debug) donne lieu à une fiche datée dans `vibeworkspace/base-de-connaissances/` (métadonnées, tableau résumé, procédures copiables, pièges/leçons) + entrée dans `base-de-connaissances/INDEX.md`. **Pas de copie de la fiche poussée sur le téléphone** (supprimé le 2026-11-06 : la base de connaissances vit dans le dépôt git, pas sur l'appareil).

---

# Repères projet (OpenCode) — vérifiés dans le code

Deux couches dans le même dépôt, à ne pas confondre :

- `utoulookmail/` = empaquetage click : wrapper shell `command.sh` (process principal du click, ~560 lignes), écrans `qml/`, util C `notify`, `compiledeps.sh` (deps `.deb` embarquées), `clickable.yaml`.
- `utoulookmail/utoutlookmail/` = app Electron (fork « prospect-mail ») : entrée `src/main.mjs`, JS/CSS injectés dans la webapp Outlook dans `public/`, tests dans `test/app.test.mjs`.
- Le click embarque `utoutlookmail/dist/prospect-mail-*-arm64.tar.gz`, et `clickable.yaml` prend **le plus récent** : sans tar.gz arm64 à jour, le click repart avec l'ancienne app.

## Commandes (depuis `utoulookmail/utoutlookmail/`)

```bash
npm test                                                     # node --test (test/app.test.mjs)
node --test --test-name-pattern='config' test/app.test.mjs    # un seul groupe de tests
ESLINT_USE_FLAT_CONFIG=false npm run lint                     # obligatoire : ESLint 9 + .eslintrc.json legacy
```

- ESLint sort ~1170 warnings mais **0 erreur** : seul un passage à >0 erreur casse la CI.
- `./check.sh` (racine) = pré-vol complet en une commande : `bash -n` (racine + `utoulookmail/` + `githooks/`), `node --check`, synchro `manifest.json`/`package.json`, `npm run lint`, `npm test`, grep `brethous`, et scan i18n (informatif). Il sort en code 1 dès qu'une étape échoue.
- Version : `./bump-version.sh X.Y.Z` met à jour `manifest.json` **et** `package.json` (les deux doivent rester identiques).

## Pièges coûteux

- **AppArmor** : une app click ne peut pas exécuter de binaire hors de son paquet. D'où `"${WD}"/bin/...` partout et la liste `cp /usr/bin/...` de `clickable.yaml`. Toute nouvelle commande système (grep, nc, sleep…) utilisée par un script du click doit y être ajoutée, sinon échec **uniquement sur device** (tout marche en local).
- **i18n dédoublé** : `src/i18n.mjs` (UI Electron) **et** `utils/common.sh` → `utoutlook_t()` (notifications shell + chaînes QML, écrites dans `/tmp/utoutlook-qml-i18n.js`). Une chaîne visible = les deux catalogues, 8 langues (fr en es de it pt zh ar), fallback fr.
- **QML** : QML brut lu par `qmlscene` ; `.import` est rejeté (`Expected token numeric literal`) → utiliser `import`.
- **`package.json`** : la clé `"type:"` (deux-points) est une typo laissée exprès ; ne pas la « corriger » en `"type": "module"`, les preloads `src/controller/*.js` sont en CommonJS (`require`).
- **Chemins** : tout est centralisé dans `src/config.mjs` (`APP_ID`, `CONFIG_DIR`, `SOCKET_PATH`, fichiers de flags). Ne pas recoder `/home/phablet` en dur.
- **Injection** : `client-injector.mjs` refuse tout fichier hors de `public/` — les JS/CSS injectés doivent y être.
- `command.sh` et `src/controller/mail-window-controller.mjs` (~3000 lignes) concentrent les correctifs : chaque bloc est un fix de régression étiqueté `vX.Y.Z` (zombies, rotation, double relance, crash GPU). Lire les commentaires avant de simplifier — les retirer réintroduit un bug déjà corrigé.

## Cycle de vie wrapper ↔ Electron

`command.sh` lance `bin/App/prospect-mail`, surveille le heartbeat `~/.config/utoutlook.mathias/follow`, tue/relance, et affiche les QML (`relaunch.qml` après rotation, `nonetwork.qml`, `exit.qml`). Flags de vie = fichiers dans `~/.config/utoutlook.mathias/` : `exitclient` (`quitclient:<wrapper-pid>`), `rotation-relaunch`, `close`, `init`, `killedmail`.

Debug device sans rebuild (device adb `57606579` ; l'ID `71b90fee` du § OpenStore ci-dessus est périmé) :

```bash
printf '{"cmd":"eval","code":"window.location.href"}\n' | nc -U /home/phablet/.config/utoutlook.mathias/utoutlook.sock
./test-rapide.sh          # tue les zombies, lance, affiche état/logs/token
./watch-log.sh error      # tail wrapper.log filtré (error|loop|page|cookie)
```

Commandes socket (`src/ipc-socket.mjs`) : `eval ping quit show zoom zoomIn zoomOut zoomReset text reload readingFont`. Logs : `wrapper.log`, `crash.log`, `relaunch-qml.log`.

## Build / CI / release

- Build **jamais** depuis l'agent (§ Build manuel). `./build-deploy.sh [version]` = electron-builder arm64 + `clickable build --arch arm64` + install ; `utoulookmail/build-fast.sh [jobs] [--cpp-only|--electron-only]` pour le C++/Electron séparément (`make` dans `utoulookmail/`).
- Ne pas utiliser `npm run dist:linux:targz` pour un click local : il construit x64 **et** arm64 (2× plus long) ; `build-deploy.sh` appelle `electron-builder --arm64` seul.
- Le `README.md` racine est en partie obsolète (`cd prospectmailut`, `./make-project`) : se fier à `build-deploy.sh` / `build-fast.sh`.
- CI `.github/workflows/ci.yml` : `npm test` (Node 22 et 24), `npm run lint`, build Electron sur push `main`/`feature/**`/`fix/**`/`hotfix/**` et PR vers `main`. `build-click.yml` ne tourne que sur tag `v*`, `workflow_dispatch` ou commit contenant `[click]` sur `main`.
- Hooks actifs ici (`core.hooksPath=githooks`) : pre-commit bloque > 50 Mo hors `.click`, pre-push bloque les `.click` et les blobs > 100 Mo.
- Livraison : `livraison/utoutlook-<ver>/` **de ce dépôt** (dernières : 4.0.41, 4.0.93) + kit `publishstore/utoutlook-<ver>/`. `./git-auto.sh livraison <ver> "titre"` copie le `.click` de **cette version** (depuis `utoulookmail/build/<arch>/app/`), exige `CHANGELOG.md` + `README.txt` (abandon sinon) et commit avec `git add -f`.
