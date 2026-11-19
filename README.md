# UToutlook Mail

[![CI](https://github.com/mathiasmb31/utoutlook/actions/workflows/ci.yml/badge.svg)](https://github.com/mathiasmb31/utoutlook/actions/workflows/ci.yml)
[![Build Click](https://github.com/mathiasmb31/utoutlook/actions/workflows/build-click.yml/badge.svg)](https://github.com/mathiasmb31/utoutlook/actions/workflows/build-click.yml)

Outlook / Microsoft 365 mail client for Ubuntu Touch (24.04+). It wraps the Outlook
web app in a dedicated full-screen Electron window, with new-mail notifications,
an unread badge on the launcher, and an eight-language interface.

Inspired from Julien Alarcon (MIT) — the original `prospect-mail` project, itself
based on `electron-outlook` by Howard J. Rewritten for Ubuntu Touch and small
screens by Mathias.

## Install

- Preferred: install **UToutlook Mail** from the OpenStore.
- Manual: transfer the `utoutlook.mathias_<version>_arm64.click` to the phone, then
  `clickable install` or `adb install` it.

Requires Ubuntu Touch 24.04 or newer; older releases are not supported.

## Build (maintainers)

The repository has two layers:

- `utoulookmail/utoutlookmail/` — the Electron application (JS/CSS injected into
  Outlook, tests in `test/app.test.mjs`).
- `utoulookmail/` — the click packaging: `command.sh` (supervisor), `qml/` screens,
  C helpers, `clickable.yaml`.

```bash
# Build Electron arm64, then the click, then install on the device:
./build-deploy.sh [version]

# Build only (faster, no install):
./build-fast.sh [jobs]

# Pre-flight checks (syntax, lint, tests, confidentiality, i18n):
./check.sh

# Interactive helper (scripts with descriptions and defaults from the context):
./menu.sh
```

`./bump-version.sh X.Y.Z` keeps `manifest.json` and `package.json` in sync.
Never push a `.click` to a remote: the hook `githooks/pre-push` blocks it (activate
with `git config core.hooksPath githooks`).

## Device debugging

The test device is `adb 57606579`.

```bash
./watch-log.sh error      # live wrapper log filtered (error|loop|page|cookie)
./test-rapide.sh          # quick install + launch + log state
```

The device must be unlocked: `/home/phablet` is encrypted, and a locked device
returns `Required key not available` to `adb push` and hides the logs.

If a graphics crash occurs on some phones, the app offers a software-rendering
choice at startup; the decision is persisted in
`~/.config/utoutlook.mathias/render-mode` and can be overridden there
(`auto`, `software`, `hardware`).

## Screen sizes and zoom

The window is resized to the full screen on display changes in portrait and
landscape. Injected CSS is mobile-first: 8 px paddings, 30 px touch scrollbars,
44 px minimum touch targets, `@media (min-width: 768px)` for tablets, dark theme
via `prefers-color-scheme`. Zoom can be adjusted from the tray menu and through
the IPC socket (`zoomIn`, `zoomOut`, `zoomReset`).

## Internationalisation

FR, EN, ES, DE, IT, PT, ZH and AR. The system language is detected automatically,
with French as fallback. All user-visible strings go through the catalogue
(`src/i18n.mjs` for Electron, `utils/common.sh` for shell/QML screens).

## Battery / CPU (measured 2026-11-07, Fairphone 5)

- Background: Lomiri freezes the app (SIGSTOP) → 0 % CPU; battery impact negligible.
- Foreground: ~110 % CPU peak while the Outlook page loads, then 0.1–0.7 %;
  ~0.7–1.3 GB RSS because Chromium is embedded.

The click is large (>100 MB) because it embeds Chromium, which Ubuntu Touch does
not provide system-wide.

## License and credits

MIT — see [LICENSE](LICENSE). Original `prospect-mail`: MIT (Julien Alarcon);
`electron-outlook`: MIT (Howard J).

Built and tested by Mathias — code written by Vibe, reviewed and controlled by Mathias.

Bugs and requests: GitHub issues.
