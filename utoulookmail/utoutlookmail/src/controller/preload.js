const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    updateUnread: (unread) => ipcRenderer.send("updateUnread", unread),
    showWindow: () => ipcRenderer.send("show"),
    showNotification: (title, body, icon = null) =>
        ipcRenderer.send("show-notification", {title, body, icon}),
    // Text insertion (for virtual keyboard / external input)
    insertText: (text) => ipcRenderer.send("insert-text", text),
    // Zoom controls
    zoomIn: () => ipcRenderer.send("zoom", {action: "in"}),
    zoomOut: () => ipcRenderer.send("zoom", {action: "out"}),
    zoomReset: () => ipcRenderer.send("zoom", {action: "reset"}),
});
