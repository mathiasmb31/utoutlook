import {app, dialog, Menu, nativeImage, shell, Tray,} from 'electron';
import {spawn} from 'child_process';
import {settings} from "../settings.mjs";
import {t, getAvailableLanguages} from "../i18n.mjs";
import {fileURLToPath} from 'url';
import path from 'node:path';

import {promises as fs} from 'fs';
import {openAboutWindow} from "./about-window.js";
import {logger} from '../logger.mjs';

const macOS = process.platform === "darwin";
const __filenameNew = fileURLToPath(import.meta.url)

const __dirnameNew = path.dirname(__filenameNew)

/**
 * TrayController — Gère l'icône dans la barre système (tray) et son menu contextuel.
 *
 * Responsabilités :
 * - Icône tray avec badge de messages non lus (agrégé sur tous les comptes)
 * - Menu contextuel (Show, Reload, Accounts, Settings, About, Quit)
 * - Sélecteur de compte multi-comptes avec unread counts
 * - Mise à jour du badge launcher Ubuntu Touch via le binary `notify --badge`
 */
export class TrayController {
    /**
     * @param {import('../account-manager.mjs').AccountManager} accountManager
     */
    constructor(accountManager) {
        this.accountManager = accountManager;
        this.init();
    }

    /**
     * Backward-compatible accessor for the primary account's controller.
     * @returns {import('./mail-window-controller.mjs').default|undefined}
     */
    get mailController() {
        return this.accountManager?.getPrimary();
    }

    init() {
        this.tray = new Tray(this.createTrayIcon(0));
        this.buildContextMenu();

        this.tray.on("click", () => this.fireClickEvent());

        // Aggregate unread counts from all accounts
        this.accountManager.onUnreadChange = (totalUnread) => {
            this.tray.setImage(this.createTrayIcon(totalUnread));
            this.updateLauncherBadge(totalUnread);
            // Rebuild menu to update per-account unread badges
            this.buildContextMenu();
        };

        // Rebuild menu when accounts change
        this.accountManager.onAccountsChange = () => {
            this.buildContextMenu();
        };
    }

    /**
     * Met à jour le badge du launcher Ubuntu Touch via D-Bus LauncherEntry.
     * Le compteur est plafonné à 99 — au-delà, le badge devient illisible
     * sur l'icône du launcher (petite taille d'affichage).
     * @param {number} count - Nombre total de messages non lus
     */
    updateLauncherBadge(count) {
        const notifyPath = this.accountManager.getNotifyBinaryPath?.();
        if (!notifyPath) return;
        // Cap at 99 — larger numbers overflow the small launcher badge
        const displayCount = Math.min(count || 0, 99);
        try {
            const child = spawn(notifyPath, ['--badge', String(displayCount)], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            child.on('error', (err) => {
                logger.error('Failed to update launcher badge:', err);
            });
        } catch (err) {
            logger.error('Failed to update launcher badge:', err);
        }
    }

    buildContextMenu() {
        const activeId = this.accountManager.getActiveId();
        const accounts = this.accountManager.getAccounts();
        const currentLang = settings.get('language') || 'auto';

        // Build language submenu
        const langSubmenu = Object.entries(getAvailableLanguages()).map(([code, name]) => ({
            label: `${code === currentLang ? '● ' : '○ '}${name}`,
            click: () => this.setLanguage(code),
        }));
        langSubmenu.unshift({
            label: `${currentLang === 'auto' ? '● ' : '○ '}${t('tray.darkMode.auto')}`,
            click: () => this.setLanguage('auto'),
        });

        // Build accounts submenu
        const accountsSubmenu = accounts.map(acct => {
            const unread = this.accountManager.getUnreadCount(acct.id);
            const badge = unread > 0 ? ` (${unread})` : '';
            const isActive = acct.id === activeId;
            return {
                label: `${isActive ? '● ' : '○ '}${acct.name}${badge}`,
                click: () => this.accountManager.setActiveAccount(acct.id),
            };
        });

        // Add "Add account" and separator
        accountsSubmenu.push({type: "separator"});
        accountsSubmenu.push({
            label: t('tray.addAccount'),
            click: () => this.promptAddAccount(),
        });

        // Add "Remove account" for non-primary accounts
        if (accounts.length > 1) {
            accountsSubmenu.push({
                label: t('tray.removeAccount'),
                submenu: accounts
                    .filter(a => a.id !== activeId)
                    .map(acct => ({
                        label: acct.name,
                        click: () => this.confirmRemoveAccount(acct.id, acct.name),
                    })),
            });
        }

        const context = Menu.buildFromTemplate([
            {label: t('tray.show'), click: () => this.forceShow()},
            {label: t('tray.reload'), click: () => this.reloadWindow()},
            {type: "separator"},

            {
                label: t('tray.accounts'),
                submenu: accountsSubmenu,
            },

            {type: "separator"},

            {
                label: t('tray.settings'),
                submenu: [
                    {
                        label: t('tray.startMinimized'),
                        type: "checkbox",
                        checked: settings.get("startMinimized"),
                        click: () => this.toggleStartMinimized(),
                    },
                    {type: "separator"},
                    {
                        label: t('tray.hideOnClose'),
                        type: "checkbox",
                        checked: settings.get("hideOnClose"),
                        click: () => this.toggleHideOnClose(),
                    },
                    {
                        label: t('tray.hideOnMinimize'),
                        type: "checkbox",
                        checked: settings.get("hideOnMinimize"),
                        click: () => this.toggleHideOnMinimize(),
                    },
                    {
                        label: t('tray.showWindowFrame'),
                        type: "checkbox",
                        checked: settings.get("showWindowFrame"),
                        click: () => this.toggleWindowFrame(),
                    },
                    {type: "separator"},
                    {
                        label: t('tray.focusMode'),
                        type: "checkbox",
                        checked: settings.get("focusMode"),
                        click: () => this.toggleFocusMode(),
                    },
                    {
                        label: t('tray.darkMode'),
                        submenu: [
                            {label: t('tray.darkMode.auto'), click: () => this.setDarkMode('auto')},
                            {label: t('tray.darkMode.on'), click: () => this.setDarkMode('on')},
                            {label: t('tray.darkMode.off'), click: () => this.setDarkMode('off')},
                        ],
                    },
                    {
                        label: t('tray.accentColor'),
                        submenu: [
                            {label: t('color.blue'), click: () => this.setAccentColor('#0078d4')},
                            {label: t('color.green'), click: () => this.setAccentColor('#107c10')},
                            {label: t('color.purple'), click: () => this.setAccentColor('#5c2d91')},
                            {label: t('color.pink'), click: () => this.setAccentColor('#e3008c')},
                            {label: t('color.orange'), click: () => this.setAccentColor('#d83b01')},
                            {label: t('color.red'), click: () => this.setAccentColor('#a4262c')},
                            {label: t('color.turquoise'), click: () => this.setAccentColor('#00b7c3')},
                        ],
                    },
                    {type: "separator"},
                    {
                        label: t('tray.language'),
                        submenu: langSubmenu,
                    },
                    {type: "separator"},
                    {
                        label: t('tray.exportSettings'),
                        click: () => this.exportSettings(),
                    },
                    {
                        label: t('tray.importSettings'),
                        click: () => this.importSettings(),
                    },
                    {type: "separator"},
                    {
                        label: t('tray.showSettingsFile'),
                        click: () => shell.showItemInFolder(path.resolve(settings.path)),
                    },
                    {
                        label: t('tray.restoreDefaults'),
                        click: () => this.restoreDefaultSettings(),
                    },
                    {
                        label: t('tray.resetAppData'),
                        click: () => this.confirmFullReset(),
                    },
                ],
            },

            {type: "separator"},
            {
                label: t('tray.about'),
                click: () => openAboutWindow(),
            },
            {label: t('tray.quit'), click: () => this.cleanupAndQuit()},
        ]);

        this.tray.setContextMenu(context);
    }

    /**
     * Change the application language.
     * @param {string} lang - Language code or 'auto'
     */
    async setLanguage(lang) {
        settings.set('language', lang);
        const {setLanguage: setI18nLang} = await import('../i18n.mjs');
        const {resolveLanguage} = await import('../settings.mjs');
        const effectiveLang = resolveLanguage();
        setI18nLang(effectiveLang);
        logger.info(`Language changed to: ${effectiveLang}`);
        this.buildContextMenu();
        // Reload all windows to apply new language to injected content
        this.accountManager.reloadAll();
    }

    createTrayIcon(value) {
        const isUnread = Boolean(value);
        let iconPath;

        if (macOS) {
            iconPath = isUnread
                ? "../../assets/outlook_macOS_unread.png"
                : "../../assets/outlook_macOS.png";

            const trayIcon = nativeImage.createFromPath(
                path.join(__dirnameNew, iconPath)
            );
            trayIcon.setTemplateImage(true);
            return trayIcon;
        }

        // For non-macOS platforms
        iconPath = isUnread
            ? "../../assets/outlook_linux_unread.png"
            : "../../assets/outlook_linux_black.png";

        return nativeImage.createFromPath(path.join(__dirnameNew, iconPath));
    }

    fireClickEvent() {
        const primary = this.mailController;
        if (primary) primary.toggleWindow();
    }

    forceShow() {
        const primary = this.mailController;
        if (!primary || !primary.win) return;

        if (!primary.win.isVisible()) {
            primary.toggleWindow();
        }
        primary.win.show();
    }

    reloadWindow() {
        this.accountManager.reloadAll();
    }

    toggleStartMinimized() {
        let orivalue = settings.get("startMinimized");
        settings.set("startMinimized", !orivalue);
        this.buildContextMenu();
    }

    toggleWindowFrame() {
        let orivalue = settings.get("showWindowFrame");
        settings.set("showWindowFrame", !orivalue);
        this.buildContextMenu();
        // Recreate all account windows with the new frame setting
        global.preventAutoCloseApp = true;
        try {
            this.accountManager.quitAll();
            this.accountManager.controllers.clear();
            this.accountManager.init();
        } finally {
            global.preventAutoCloseApp = false;
        }
    }

    toggleHideOnClose() {
        let orivalue = settings.get("hideOnClose");
        settings.set("hideOnClose", !orivalue);
        this.buildContextMenu();
    }

    toggleHideOnMinimize() {
        let orivalue = settings.get("hideOnMinimize");
        settings.set("hideOnMinimize", !orivalue);
        this.buildContextMenu();
    }

    /**
     * Bascule le mode lecture concentrée sur tous les comptes.
     */
    async toggleFocusMode() {
        const newValue = !settings.get("focusMode");
        settings.set("focusMode", newValue);
        for (const controller of this.accountManager.controllers.values()) {
            controller.focusMode = newValue;
            await controller.injectStyles();
        }
        this.buildContextMenu();
    }

    /**
     * Définit la couleur d'accent sur tous les comptes.
     * @param {string} color - Code couleur hex
     */
    async setAccentColor(color) {
        settings.set("accentColor", color);
        for (const controller of this.accountManager.controllers.values()) {
            controller.accentColor = color;
            await controller.injectStyles();
        }
        this.buildContextMenu();
    }

    /**
     * Définit le mode sombre sur tous les comptes.
     * @param {string} mode - 'auto' | 'on' | 'off'
     */
    async setDarkMode(mode) {
        settings.set("darkMode", mode);
        for (const controller of this.accountManager.controllers.values()) {
            await controller.applyDarkModeClass();
            await controller.injectStyles();
        }
        this.buildContextMenu();
    }

    /**
     * Exporte les paramètres vers un fichier JSON choisi par l'utilisateur.
     */
    async exportSettings() {
        const result = await dialog.showSaveDialog({
            title: t('dialog.export.title'),
            defaultPath: "utoutlook-settings.json",
            filters: [{name: "JSON", extensions: ["json"]}],
        });

        if (result.canceled || !result.filePath) return;

        try {
            const data = settings.store;
            await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
            logger.info(`Settings exported to: ${result.filePath}`);
            await dialog.showMessageBox({
                type: "info",
                buttons: [t('common.ok')],
                title: t('dialog.export.success.title'),
                message: t('dialog.export.success.message'),
                detail: t('dialog.export.success.detail', {path: result.filePath}),
            });
        } catch (error) {
            logger.error('Export failed:', error);
            dialog.showErrorBox(t('dialog.export.error'), error.message);
        }
    }

    /**
     * Importe les paramètres depuis un fichier JSON choisi par l'utilisateur.
     */
    async importSettings() {
        const result = await dialog.showOpenDialog({
            title: t('dialog.import.title'),
            filters: [{name: "JSON", extensions: ["json"]}],
            properties: ["openFile"],
        });

        if (result.canceled || !result.filePaths.length) return;

        try {
            const data = JSON.parse(await fs.readFile(result.filePaths[0], 'utf-8'));
            // Merge imported settings (don't overwrite accounts unless present)
            for (const [key, value] of Object.entries(data)) {
                settings.set(key, value);
            }
            logger.info(`Settings imported from: ${result.filePaths[0]}`);
            await dialog.showMessageBox({
                type: "info",
                buttons: [t('common.ok')],
                title: t('dialog.import.success.title'),
                message: t('dialog.import.success.message'),
                detail: t('dialog.import.success.detail'),
            });
            app.relaunch();
            app.exit(0);
        } catch (error) {
            logger.error('Import failed:', error);
            dialog.showErrorBox(t('dialog.import.error'), t('dialog.import.error.detail', {error: error.message}));
        }
    }

    /**
     * Prompt the user to add a new account.
     */
    async promptAddAccount() {
        const {response} = await dialog.showMessageBox({
            type: "info",
            buttons: [t('common.cancel'), t('dialog.addAccount.confirm')],
            defaultId: 1,
            cancelId: 0,
            title: t('dialog.addAccount.title'),
            message: t('dialog.addAccount.message'),
            detail: t('dialog.addAccount.detail'),
        });

        if (response !== 1) return;

        const accounts = this.accountManager.getAccounts();
        const newId = `account-${Date.now()}`;
        this.accountManager.addAccount({
            id: newId,
            name: t('account.new', {n: accounts.length + 1}),
            url: settings.get('urlMainWindow'),
            partition: `persist:utoutlook-${newId}`,
            enabled: true,
        });

        // Show the new account's window
        this.accountManager.setActiveAccount(newId);
    }

    /**
     * Confirm and remove an account.
     */
    async confirmRemoveAccount(id, name) {
        const {response} = await dialog.showMessageBox({
            type: "warning",
            buttons: [t('common.cancel'), t('dialog.removeAccount.confirm')],
            defaultId: 1,
            cancelId: 0,
            title: t('dialog.removeAccount.title'),
            message: t('dialog.removeAccount.message', {name}),
            detail: t('dialog.removeAccount.detail'),
        });

        if (response !== 1) return;
        this.accountManager.removeAccount(id);
    }

    async restoreDefaultSettings() {
        const {response} = await dialog.showMessageBox({
            type: "warning",
            buttons: [t('common.cancel'), t('dialog.restore.confirm')],
            defaultId: 1,
            cancelId: 0,
            title: t('dialog.restore.title'),
            message: t('dialog.restore.message'),
            detail: t('dialog.restore.detail'),
        });

        if (response !== 1) return;

        try {
            // Create backup of current settings
            const settingsPath = settings.path;
            const backupPath = `${settingsPath}.bak-${Date.now()}`;
            await fs.copyFile(settingsPath, backupPath);

            // Reset to defaults
            settings.clear();

            // Relaunch application
            app.relaunch();
            app.exit(0);
        } catch (error) {
            dialog.showErrorBox(
                t('dialog.export.error'),
                `${error.message}`
            );
        }
    }

    async confirmFullReset() {
        const {response} = await dialog.showMessageBox({
            type: "warning",
            buttons: [t('common.cancel'), t('dialog.reset.confirm')],
            defaultId: 1,
            cancelId: 0,
            title: t('dialog.reset.title'),
            message: t('dialog.reset.message'),
            detail: t('dialog.reset.detail'),
        });

        if (response !== 1) return;

        const userDataPath = app.getPath("userData");
        logger.info(`Deleting user data at: ${userDataPath}`);

        try {
            await fs.promises.rm(userDataPath, {recursive: true, force: true});

            await dialog.showMessageBox({
                type: "info",
                buttons: [t('common.ok')],
                title: t('dialog.reset.success.title'),
                message: t('dialog.reset.success.message'),
                detail: t('dialog.reset.success.detail'),
            });

            app.exit(0);
        } catch (error) {
            await dialog.showErrorBox(
                t('dialog.export.error'),
                `${error.message}`
            );
        }
    }

    cleanupAndQuit() {
        app.exit(0);
    }
}
