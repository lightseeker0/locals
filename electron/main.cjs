const { app, BrowserWindow, shell, ipcMain, Tray, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const isDev = process.env.NODE_ENV === 'development';

let tray = null;
let win = null;
let pseudoMaximized = false;
let restoreBounds = null;
let resizeSession = null;

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
// Only beta builds should receive beta updates.
autoUpdater.allowPrerelease = app.getVersion().includes('-beta.');

autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
});
autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
});
autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
});
autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
});

function createWindow() {
    // ... existing BrowserWindow config ...
    win = new BrowserWindow({
        width: 1024,
        height: 720,
        minWidth: 800,
        minHeight: 550,
        resizable: true,
        maximizable: true,
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
        thickFrame: true,
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

    // If user manually moves/resizes while in pseudo-maximized mode, treat it as restored.
    win.on('resize', () => {
        if (!win || !pseudoMaximized) return;
        const current = win.getBounds();
        const area = screen.getDisplayMatching(current).workArea;
        const stillMaximized =
            current.x === area.x &&
            current.y === area.y &&
            current.width === area.width &&
            current.height === area.height;
        if (!stillMaximized) {
            pseudoMaximized = false;
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

autoUpdater.on('before-quit-for-update', () => {
    app.isQuiting = true;
    if (win) {
        win.removeAllListeners('close');
    }
});

ipcMain.on('install-update', () => {
    app.isQuiting = true;
    if (win) {
        win.removeAllListeners('close');
    }
    // Silent install avoids the default NSIS progress window.
    autoUpdater.quitAndInstall(true, true);
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
        return { ok: false, reason: 'dev-mode' };
    }

    try {
        const result = await autoUpdater.checkForUpdates();
        return { ok: true, updateInfo: result?.updateInfo || null };
    } catch (err) {
        const message = err?.message || String(err);
        if (win) win.webContents.send('update-error', message);
        return { ok: false, reason: message };
    }
});

// Window Control IPC
ipcMain.on('window-minimize', () => win?.minimize());
ipcMain.on('window-maximize', () => {
    if (!win) return;
    if (win.isFullScreen()) {
        win.setFullScreen(false);
        return;
    }

    if (pseudoMaximized) {
        if (restoreBounds) {
            win.setBounds(restoreBounds);
        }
        pseudoMaximized = false;
        return;
    }

    restoreBounds = win.getBounds();
    const workArea = screen.getDisplayMatching(restoreBounds).workArea;
    win.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
    });
    pseudoMaximized = true;
});
ipcMain.on('window-close', () => win?.close());

ipcMain.handle('window-resize-start', (_event, payload) => {
    if (!win || !payload) return false;
    if (pseudoMaximized || win.isFullScreen()) return false;

    const { edge, screenX, screenY } = payload;
    if (!edge || !Number.isFinite(screenX) || !Number.isFinite(screenY)) return false;

    resizeSession = {
        edge,
        startX: screenX,
        startY: screenY,
        startBounds: win.getBounds(),
        minWidth: win.getMinimumSize()[0] || 800,
        minHeight: win.getMinimumSize()[1] || 550
    };
    return true;
});

ipcMain.on('window-resize-move', (_event, payload) => {
    if (!win || !resizeSession || !payload) return;
    if (!Number.isFinite(payload.screenX) || !Number.isFinite(payload.screenY)) return;

    const dx = payload.screenX - resizeSession.startX;
    const dy = payload.screenY - resizeSession.startY;
    const b = resizeSession.startBounds;

    let x = b.x;
    let y = b.y;
    let width = b.width;
    let height = b.height;

    if (resizeSession.edge.includes('right')) {
        width = Math.max(resizeSession.minWidth, b.width + dx);
    }
    if (resizeSession.edge.includes('left')) {
        width = Math.max(resizeSession.minWidth, b.width - dx);
        x = b.x + (b.width - width);
    }
    if (resizeSession.edge.includes('bottom')) {
        height = Math.max(resizeSession.minHeight, b.height + dy);
    }
    if (resizeSession.edge.includes('top')) {
        height = Math.max(resizeSession.minHeight, b.height - dy);
        y = b.y + (b.height - height);
    }

    win.setBounds({ x, y, width, height });
});

ipcMain.on('window-resize-end', () => {
    resizeSession = null;
});

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
