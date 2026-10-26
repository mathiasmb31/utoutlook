// ============================================================
// account-manager.mjs — Multi-account support for Utoutlook Mail
//
// Manages multiple MailWindowController instances, one per account.
// Each account has its own session partition (storage isolation),
// its own BrowserWindow, and its own unread count.
// ============================================================

import MailWindowController from './controller/mail-window-controller.mjs';
import {settings} from './settings.mjs';
import {logger} from './logger.mjs';
import {t} from './i18n.mjs';

/**
 * @typedef {Object} AccountConfig
 * @property {string} id - Unique account identifier
 * @property {string} name - Display name
 * @property {string} url - Outlook URL for this account
 * @property {string} partition - Session partition (persist:<name>)
 * @property {boolean} enabled - Whether this account is active
 */

export class AccountManager {
    constructor() {
        /** @type {Map<string, MailWindowController>} */
        this.controllers = new Map();
        /** @type {Map<string, number>} aggregated unread counts per account */
        this.unreadCounts = new Map();
        /** @type {string|null} callback when unread counts change */
        this.onUnreadChange = null;
        /** @type {string|null} callback when accounts list changes */
        this.onAccountsChange = null;
    }

    /**
     * Initialize all enabled accounts from settings.
     */
    init() {
        const accounts = settings.get('accounts') || [];
        const activeId = settings.get('activeAccountId') || 'default';

        for (const acct of accounts) {
            if (acct.enabled) {
                this.createAccount(acct, acct.id === activeId);
            }
        }

        // Ensure at least one account exists
        if (this.controllers.size === 0) {
            const fallback = {
                id: 'default',
                name: t('account.default'),
                url: settings.get('urlMainWindow'),
                partition: 'persist:utoutlook-default',
                enabled: true,
            };
            this.createAccount(fallback, true);
            // Persist the fallback account
            settings.set('accounts', [fallback]);
            settings.set('activeAccountId', 'default');
        }

        logger.info(`AccountManager: ${this.controllers.size} account(s) loaded`);
    }

    /**
     * Create a MailWindowController for an account.
     * @param {AccountConfig} config
     * @param {boolean} [showOnCreate=false] - Whether to show this window immediately
     * @returns {MailWindowController}
     */
    createAccount(config, showOnCreate = false) {
        const controller = new MailWindowController(config);

        // Wire up unread tracking
        controller.onUnreadChange = (accountId, count) => {
            this.unreadCounts.set(accountId, count);
            this.updateTotalUnread();
        };

        this.controllers.set(config.id, controller);
        this.unreadCounts.set(config.id, 0);

        logger.info(`Account created: ${config.id} (${config.name})`);
        return controller;
    }

    /**
     * Get a controller by account ID.
     * @param {string} id
     * @returns {MailWindowController|undefined}
     */
    getController(id) {
        return this.controllers.get(id);
    }

    /**
     * Get the primary (active) account's controller.
     * @returns {MailWindowController|undefined}
     */
    getPrimary() {
        const activeId = settings.get('activeAccountId') || 'default';
        return this.controllers.get(activeId) || this.controllers.values().next().value;
    }

    /**
     * Get the active account ID.
     * @returns {string}
     */
    getActiveId() {
        return settings.get('activeAccountId') || 'default';
    }

    /**
     * Set the active account and show its window.
     * @param {string} id
     */
    setActiveAccount(id) {
        const controller = this.controllers.get(id);
        if (!controller) {
            logger.warn(`Cannot activate unknown account: ${id}`);
            return;
        }
        settings.set('activeAccountId', id);
        controller.show();
        logger.info(`Active account switched to: ${id}`);
    }

    /**
     * Show a specific account's window (without changing the active account).
     * @param {string} id
     */
    showAccount(id) {
        const controller = this.controllers.get(id);
        if (controller) controller.show();
    }

    /**
     * Toggle a specific account's window visibility.
     * @param {string} id
     */
    toggleAccount(id) {
        const controller = this.controllers.get(id);
        if (controller) controller.toggleWindow();
    }

    /**
     * Add a new account.
     * @param {AccountConfig} config
     * @returns {MailWindowController}
     */
    addAccount(config) {
        // Ensure unique ID
        if (this.controllers.has(config.id)) {
            config.id = `${config.id}-${Date.now()}`;
        }
        if (!config.partition) {
            config.partition = `persist:utoutlook-${config.id}`;
        }

        const controller = this.createAccount(config, false);

        // Persist to settings
        const accounts = settings.get('accounts') || [];
        accounts.push(config);
        settings.set('accounts', accounts);

        if (this.onAccountsChange) this.onAccountsChange();
        return controller;
    }

    /**
     * Remove an account (closes its window and deletes its config).
     * @param {string} id
     */
    removeAccount(id) {
        const controller = this.controllers.get(id);
        if (!controller) return;

        // Don't remove the last account
        if (this.controllers.size <= 1) {
            logger.warn('Cannot remove the last account');
            return;
        }

        // Destroy the window
        if (controller.win && !controller.win.isDestroyed()) {
            controller.win.destroy();
        }
        this.controllers.delete(id);
        this.unreadCounts.delete(id);

        // Remove from settings
        const accounts = settings.get('accounts') || [];
        settings.set('accounts', accounts.filter(a => a.id !== id));

        // If we removed the active account, switch to the first remaining
        if (settings.get('activeAccountId') === id) {
            const firstId = this.controllers.keys().next().value;
            settings.set('activeAccountId', firstId);
        }

        this.updateTotalUnread();
        if (this.onAccountsChange) this.onAccountsChange();
        logger.info(`Account removed: ${id}`);
    }

    /**
     * Get all account configs.
     * @returns {AccountConfig[]}
     */
    getAccounts() {
        return settings.get('accounts') || [];
    }

    /**
     * Get unread count for a specific account.
     * @param {string} id
     * @returns {number}
     */
    getUnreadCount(id) {
        return this.unreadCounts.get(id) || 0;
    }

    /**
     * Get total unread count across all accounts.
     * @returns {number}
     */
    getTotalUnread() {
        let total = 0;
        for (const count of this.unreadCounts.values()) {
            total += count;
        }
        return total;
    }

    /**
     * Update the total unread count and notify listeners (tray, launcher badge).
     */
    updateTotalUnread() {
        const total = this.getTotalUnread();
        if (this.onUnreadChange) {
            this.onUnreadChange(total);
        }
    }

    /**
     * Get the notify binary path from the primary controller.
     * @returns {string|null}
     */
    getNotifyBinaryPath() {
        const primary = this.getPrimary();
        return primary ? primary.getNotifyBinaryPath() : null;
    }

    /**
     * Reload all account windows.
     */
    reloadAll() {
        for (const controller of this.controllers.values()) {
            controller.reloadWindow();
        }
    }

    /**
     * Show all account windows.
     */
    showAll() {
        for (const controller of this.controllers.values()) {
            controller.show();
        }
    }

    /**
     * Quit all accounts (cleanup and exit).
     */
    quitAll() {
        for (const controller of this.controllers.values()) {
            if (controller.win && !controller.win.isDestroyed()) {
                controller.win.destroy();
            }
        }
    }
}

export default AccountManager;
