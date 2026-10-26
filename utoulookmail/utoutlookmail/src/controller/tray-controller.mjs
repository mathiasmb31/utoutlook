import {app, dialog, Menu, nativeImage, shell, Tray,} from 'electron';
import {spawn} from 'child_process';
import {settings} from "../settings.mjs";
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
     * @param {number} count - Nombre total de messages non lus
     */
    updateLauncherBadge(count) {
        const notifyPath = this.accountManager.getNotifyBinaryPath?.();
        if (!notifyPath) return;
        try {
            const child = spawn(notifyPath, ['--badge', String(count || 0)], {
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
            label: "+ Ajouter un compte",
            click: () => this.promptAddAccount(),
        });

        // Add "Remove account" for non-primary accounts
        if (accounts.length > 1) {
            accountsSubmenu.push({
                label: "− Supprimer un compte",
                submenu: accounts
                    .filter(a => a.id !== activeId)
                    .map(acct => ({
                        label: acct.name,
                        click: () => this.confirmRemoveAccount(acct.id, acct.name),
                    })),
            });
        }

        const context = Menu.buildFromTemplate([
            {label: "Show", click: () => this.forceShow()},
            {label: "Reload", click: () => this.reloadWindow()},
            {type: "separator"},

            {
                label: "Comptes",
                submenu: accountsSubmenu,
            },

            {type: "separator"},

            {
                label: "Settings",
                submenu: [
                    {
                        label: "Start Minimized",
                        type: "checkbox",
                        checked: settings.get("startMinimized"),
                        click: () => this.toggleStartMinimized(),
                    },
                    {type: "separator"},
                    {
                        label: "Hide on Close",
                        type: "checkbox",
                        checked: settings.get("hideOnClose"),
                        click: () => this.toggleHideOnClose(),
                    },
                    {
                        label: "Hide on Minimize",
                        type: "checkbox",
                        checked: settings.get("hideOnMinimize"),
                        click: () => this.toggleHideOnMinimize(),
                    },
                    {
                        label: "Show Window Frame",
                        type: "checkbox",
                        checked: settings.get("showWindowFrame"),
                        click: () => this.toggleWindowFrame(),
                    },
                    {type: "separator"},
                    {
                        label: "Mode lecture concentrée",
                        type: "checkbox",
                        checked: settings.get("focusMode"),
                        click: () => this.toggleFocusMode(),
                    },
                    {
                        label: "Mode sombre",
                        submenu: [
                            {label: "Auto (système)", click: () => this.setDarkMode('auto')},
                            {label: "Toujours activé", click: () => this.setDarkMode('on')},
                            {label: "Toujours désactivé", click: () => this.setDarkMode('off')},
                        ],
                    },
                    {
                        label: "Couleur d'accent",
                        submenu: [
                            {label: "Bleu Outlook (défaut)", click: () => this.setAccentColor('#0078d4')},
                            {label: "Vert", click: () => this.setAccentColor('#107c10')},
                            {label: "Violet", click: () => this.setAccentColor('#5c2d91')},
                            {label: "Rose", click: () => this.setAccentColor('#e3008c')},
                            {label: "Orange", click: () => this.setAccentColor('#d83b01')},
                            {label: "Rouge", click: () => this.setAccentColor('#a4262c')},
                            {label: "Turquoise", click: () => this.setAccentColor('#00b7c3')},
                        ],
                    },
                    {type: "separator"},
                    {
                        label: "Exporter les paramètres",
                        click: () => this.exportSettings(),
                    },
                    {
                        label: "Importer les paramètres",
                        click: () => this.importSettings(),
                    },
                    {type: "separator"},
                    {
                        label: "Show settings file",
                        click: () => shell.showItemInFolder(path.resolve(settings.path)),
                    },
                    {
                        label: "Restore Default Settings",
                        click: () => this.restoreDefaultSettings(),
                    },
                    {
                        label: "Reset Application Data",
                        click: () => this.confirmFullReset(),
                    },
                ],
            },

            {type: "separator"},
            {
                label: "About Prospect Mail",
                click: () => openAboutWindow(),
            },
            {label: "Quit", click: () => this.cleanupAndQuit()},
        ]);

        this.tray.setContextMenu(context);
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
        this.accountManager.quitAll();
        this.accountManager.controllers.clear();
        this.accountManager.init();
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
            title: "Exporter les paramètres",
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
                buttons: ["OK"],
                title: "Export réussi",
                message: "Paramètres exportés.",
                detail: `Fichier : ${result.filePath}`,
            });
        } catch (error) {
            logger.error('Export failed:', error);
            dialog.showErrorBox("Export échoué", error.message);
        }
    }

    /**
     * Importe les paramètres depuis un fichier JSON choisi par l'utilisateur.
     */
    async importSettings() {
        const result = await dialog.showOpenDialog({
            title: "Importer les paramètres",
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
                buttons: ["OK"],
                title: "Import réussi",
                message: "Paramètres importés. Redémarrage recommandé.",
                detail: "L'application va redémarrer pour appliquer tous les changements.",
            });
            app.relaunch();
            app.exit(0);
        } catch (error) {
            logger.error('Import failed:', error);
            dialog.showErrorBox("Import échoué", `Fichier invalide : ${error.message}`);
        }
    }

    /**
     * Prompt the user to add a new account.
     */
    async promptAddAccount() {
        const {response} = await dialog.showMessageBox({
            type: "info",
            buttons: ["Annuler", "Ajouter"],
            defaultId: 1,
            cancelId: 0,
            title: "Ajouter un compte",
            message: "Ajouter un nouveau compte Outlook",
            detail: "Un nouveau compte sera ajouté avec l'URL Outlook par défaut. " +
                     "Vous devrez vous connecter séparément dans la nouvelle fenêtre.",
        });

        if (response !== 1) return;

        const accounts = this.accountManager.getAccounts();
        const newId = `account-${Date.now()}`;
        this.accountManager.addAccount({
            id: newId,
            name: `Compte ${accounts.length + 1}`,
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
            buttons: ["Annuler", "Supprimer"],
            defaultId: 1,
            cancelId: 0,
            title: "Supprimer le compte",
            message: `Supprimer le compte "${name}" ?`,
            detail: "Les données de session de ce compte seront supprimées. " +
                     "Vous devrez vous reconnecter si vous le réajoutez plus tard.",
        });

        if (response !== 1) return;
        this.accountManager.removeAccount(id);
    }

    async restoreDefaultSettings() {
        const {response} = await dialog.showMessageBox({
            type: "warning",
            buttons: ["Cancel", "Restore settings"],
            defaultId: 1,
            cancelId: 0,
            title: "Confirm Restore Settings",
            message: "Restore all settings to default values?",
            detail:
                "This will restore all settings to their factory defaults but preserve your app data.",
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
                "Restore Failed",
                `Could not Restore settings: ${error.message}`
            );
        }
    }

    async confirmFullReset() {
        const {response} = await dialog.showMessageBox({
            type: "warning",
            buttons: ["Cancel", "Reset Everything"],
            defaultId: 1,
            cancelId: 0,
            title: "Confirm Full Reset",
            message: "Clear ALL application data?",
            detail:
                "This will permanently delete:\n- All settings\n- Cached emails\n- Local data\n\nThe application will quit after completion and you will need to re-enter your login information.",
        });

        if (response !== 1) return;

        const userDataPath = app.getPath("userData");
        logger.info(`Deleting user data at: ${userDataPath}`);

        try {
            await fs.promises.rm(userDataPath, {recursive: true, force: true});

            await dialog.showMessageBox({
                type: "info",
                buttons: ["OK"],
                title: "Reset Complete",
                message: "All app data has been deleted.",
                detail: "The application will now close.",
            });

            app.exit(0);
        } catch (error) {
            await dialog.showErrorBox(
                "Reset Failed",
                `Could not clear app data:\n${error.message}`
            );
        }
    }

    cleanupAndQuit() {
        app.exit(0);
    }
}
