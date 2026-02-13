const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    onThemeUpdate: (callback) => ipcRenderer.on('theme-update', (_event, value) => callback(value))
});
