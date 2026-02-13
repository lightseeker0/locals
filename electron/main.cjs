const { app, BrowserWindow, shell, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV === 'development';

let tray = null;
let win = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
        }
    });
}

const log = require('electron-log');

// Configure Auto-Updater
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
    // ... existing BrowserWindow config ...
    win = new BrowserWindow({
        width: 1024,
        height: 720,
        minWidth: 800,
        minHeight: 550,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs')
        },
        icon: path.join(__dirname, '../public/logo.png'),
        title: 'Locals',
        backgroundColor: '#00000000', // Transparent
        transparent: true,
        frame: false, // Often needed for full transparency effects
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
        loadThemes();
        if (!isDev) {
            autoUpdater.checkForUpdatesAndNotify();
            // Check every hour
            setInterval(() => {
                autoUpdater.checkForUpdates();
            }, 60 * 60 * 1000);
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
    });
}

function loadThemes() {
    const themeDir = path.join(app.getPath('userData'), 'themes');
    if (!fs.existsSync(themeDir)) {
        fs.mkdirSync(themeDir, { recursive: true });
    }

    const reloadThemes = () => {
        if (!win) return;
        try {
            const files = fs.readdirSync(themeDir);
            const themeContents = files
                .filter(f => f.endsWith('.theme.css'))
                .map(f => fs.readFileSync(path.join(themeDir, f), 'utf-8'));
            win.webContents.send('theme-update', themeContents);
        } catch (e) {
            console.error('Error loading themes:', e);
        }
    };

    // Watch for changes
    fs.watch(themeDir, (eventType, filename) => {
        if (filename && filename.endsWith('.theme.css')) {
            reloadThemes();
        }
    });

    // Initial load
    reloadThemes();
}

// Auto-Updater Events
autoUpdater.on('update-available', (info) => {
    if (win) win.webContents.send('update-available', info);
});

autoUpdater.on('checking-for-update', () => {
    if (win) win.webContents.send('checking-for-update');
});

autoUpdater.on('update-not-available', (info) => {
    if (win) win.webContents.send('update-not-available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
    if (win) win.webContents.send('update-progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
    if (win) win.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
    console.error('Updater error:', err);
});

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.on('check-for-updates', () => {
    if (!isDev) {
        autoUpdater.checkForUpdates();
    }
});

// Window Control IPC
ipcMain.on('window-minimize', () => win?.minimize());
ipcMain.on('window-maximize', () => {
    if (win?.isMaximized()) {
        win.unmaximize();
    } else {
        win?.maximize();
    }
});
ipcMain.on('window-close', () => win?.close());

autoUpdater.on('error', (err) => {
    console.error('Updater error:', err);
    if (win) win.webContents.send('update-error', err.message);
});


function createTray() {
    let iconPath = path.join(__dirname, '../public/logo.png');
    if (!fs.existsSync(iconPath)) {
        iconPath = path.join(__dirname, '../dist/logo.png');
    }

    try {
        if (fs.existsSync(iconPath)) {
            tray = new Tray(iconPath);
            const contextMenu = Menu.buildFromTemplate([
                { label: 'Show App', click: () => { if (win) win.show(); } },
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
                if (win) win.show();
            });
        }
    } catch (e) {
        console.error('Failed to create tray:', e);
    }
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
