const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, '../public/logo.png'),
        title: 'Locals',
        backgroundColor: '#000000',
        show: false
    });

    // Remove default menu
    mainWindow.setMenu(null);

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        loadThemes();
    });

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
}

function loadThemes() {
    const themeDir = path.join(app.getPath('userData'), 'themes');
    if (!fs.existsSync(themeDir)) {
        fs.mkdirSync(themeDir, { recursive: true });
    }

    const reloadThemes = () => {
        if (!mainWindow) return;
        try {
            const files = fs.readdirSync(themeDir);
            const themeContents = files
                .filter(f => f.endsWith('.theme.css'))
                .map(f => fs.readFileSync(path.join(themeDir, f), 'utf-8'));
            mainWindow.webContents.send('theme-update', themeContents);
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

function setupAutoUpdater() {
    if (isDev) {
        // Optional: Skip auto-update in dev mode
        // return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-progress', progressObj);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('Updater error:', err);
    });

    // Check for updates
    autoUpdater.checkForUpdatesAndNotify();
}

ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();

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
