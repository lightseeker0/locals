const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // Expose APIs here
    // example: sendNotification: (title, body) => ipcRenderer.send('notify', { title, body })
});
