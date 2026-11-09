const {contextBridge, ipcRenderer} = require("electron");

// Preload de la splash window : expose UNIQUEMENT first-install (belt and braces
// si l'app ne démarre pas — v4.0.10). Aucun autre accès au main process.
contextBridge.exposeInMainWorld("splashAPI", {
    firstInstall: () => ipcRenderer.invoke("first-install"),
});
