const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    onThemeUpdate: (callback) => ipcRenderer.on('theme-update', (_event, value) => callback(value)),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
    onCheckingForUpdate: (callback) => ipcRenderer.on('checking-for-update', () => callback()),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (_event, info) => callback(info)),
    installUpdate: () => ipcRenderer.send('install-update'),
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
});
