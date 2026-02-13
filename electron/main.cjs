const { app, BrowserWindow, shell, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV === 'development';

let tray = null;
let win = null;

// Configure Auto-Updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
    // ... existing BrowserWindow config ...
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        },
        icon: path.join(__dirname, '../public/logo.png'),
        title: 'Locals',
        backgroundColor: '#000000',
        show: false
    });

    // Remove default menu
    win.setMenu(null);

    if (isDev) {
        win.loadURL('http://localhost:5173');
        // win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    win.once('ready-to-show', () => {
        win.show();
        if (!isDev) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });

    // Open external links in default browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Minimize to tray instead of closing
    win.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            win.hide();
        }
        return false;
    });
}

// Auto-Updater Events
autoUpdater.on('update-available', () => {
    console.log('Update available.');
});

autoUpdater.on('update-downloaded', () => {
    console.log('Update downloaded; will install now');
});

function createTray() {
    // ...
    const iconPath = path.join(__dirname, '../public/logo.png');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => win.show() },
        {
            label: 'Quit', click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);
    tray.setToolTip('Locals');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        win.show();
    });
}

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
