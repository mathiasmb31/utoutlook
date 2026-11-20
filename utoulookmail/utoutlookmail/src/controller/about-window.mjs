import {BrowserWindow, app, shell, ipcMain} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {t} from '../i18n.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let aboutWindow = null;

/**
 * Opens the About window
 * Creates a new window if it doesn't exist, or focuses the existing one
 */
export function openAboutWindow() {
    // If window already exists, focus it
    if (aboutWindow && !aboutWindow.isDestroyed()) {
        aboutWindow.focus();
        return;
    }

    const version = app.getVersion();
    const githubUrl = "https://github.com/mathiasmb31/utoutlookmail";
    const donateUrl = "https://github.com/mathiasmb31/utoutlook"; // v4.1.0: pas de page de don dédiée — lien vers le projet

    aboutWindow = new BrowserWindow({
        width: 450,
        height: 620,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        frame: false,
        transparent: true,
        title: t('tray.about'),
        autoHideMenuBar: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "about-preload.js"),
        },
    });

    // Build URL with query parameters for version, links, and translations
    const htmlPath = path.join(__dirname, "../about.html");
    const params = new URLSearchParams({
        version: version,
        github: githubUrl,
        donate: donateUrl,
        appName: t('app.name'),
        description: t('about.description'),
        tagline: t('about.tagline'),
        basedOn: t('about.basedOn'),
        reportIssue: t('about.reportIssue'),
        githubLabel: t('about.github'),
        donateLabel: t('about.donate'),
        versionLabel: t('about.version'),
    });

    aboutWindow.loadFile(htmlPath, {
        search: params.toString(),
    });

    // Handle IPC messages for opening external links
    ipcMain.removeAllListeners("open-external-url");
    ipcMain.on("open-external-url", (event, url) => {
        if (event.sender !== aboutWindow.webContents) return;
        if (!/^https?:\/\//i.test(url)) return; // v4.1.0: refuser file:/custom
        shell.openExternal(url);
    });

    ipcMain.removeAllListeners("close-about-window");
    ipcMain.on("close-about-window", (event) => {
        if (event.sender !== aboutWindow.webContents) return;
        if (aboutWindow && !aboutWindow.isDestroyed()) {
            aboutWindow.close();
        }
    });

    // Open external links in default browser
    aboutWindow.webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: "deny"};
    });

    // Clean up reference when window is closed
    aboutWindow.on("closed", () => {
        aboutWindow = null;
    });
}
