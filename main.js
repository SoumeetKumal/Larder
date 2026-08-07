const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Determine the user data directory for storing JSON files
// This resolves to %APPDATA%/Larder on Windows
const USER_DATA_DIR = path.join(app.getPath('userData'), 'data');

// Window state (bounds + maximized flag) is persisted here so the window
// reopens where the user left it, including the maximized state.
const WIN_STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        if (fs.existsSync(WIN_STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(WIN_STATE_FILE, 'utf8'));
            if (state && typeof state === 'object') return state;
        }
    } catch (e) {
        console.warn('[Larder] Could not read window state:', e.message);
    }
    return { width: 1400, height: 900, maximized: false };
}

function saveWindowState(state) {
    try {
        fs.writeFileSync(WIN_STATE_FILE, JSON.stringify(state), 'utf8');
    } catch (e) {
        console.warn('[Larder] Could not save window state:', e.message);
    }
}

// List of data files that the server reads/writes
const DATA_FILES = [
    'recipes.json',
    'ingredients.json',
    'mealplans.json',
    'pantry.json',
    'shoppinglists.json',
    'household.json',
    'receipts.json',
    'settings.json',
    'exercises.json',
    'workoutTemplates.json'
];

function initializeDataDirectory() {
    // Create the user data directory if it doesn't exist
    if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    // In production (packaged), bundled data is in process.resourcesPath/data
    // In development, it's in __dirname/data
    const isPackaged = app.isPackaged;
    const bundledDataDir = isPackaged
        ? path.join(process.resourcesPath, 'data')
        : path.join(__dirname, 'data');

    DATA_FILES.forEach(file => {
        const destPath = path.join(USER_DATA_DIR, file);
        if (!fs.existsSync(destPath)) {
            const srcPath = path.join(bundledDataDir, file);
            if (fs.existsSync(srcPath)) {
                // Copy the bundled seed data
                fs.copyFileSync(srcPath, destPath);
                console.log(`[Larder] Copied seed data: ${file}`);
            } else {
                // Create a sensible default for this data file
                const fallback = file === 'settings.json'
                    ? '{"profiles": [{"name": "User", "calories": 2000, "carbs": 40, "protein": 30, "fat": 30}]}'
                    : '[]';
                fs.writeFileSync(destPath, fallback, 'utf8');
                console.log(`[Larder] Created default: ${file}`);
            }
        }
    });

    console.log(`[Larder] Data directory: ${USER_DATA_DIR}`);
}

function startServerInProcess() {
    // Set global flags BEFORE requiring server.js
    global.LARDER_DATA_DIR = USER_DATA_DIR;
    global.LARDER_IS_ELECTRON = true;

    // Load server.js in the same process (no child process needed)
    require('./server.js');
}

function createWindow() {
    const winState = loadWindowState();

    mainWindow = new BrowserWindow({
        width: winState.width || 1400,
        height: winState.height || 900,
        x: winState.x,
        y: winState.y,
        minWidth: 1000,
        minHeight: 700,
        title: 'Larder',
        autoHideMenuBar: true,
        // Hidden title bar: a custom, theme-aware title bar (min/max/close) is
        // injected by preload.js on every page. The native title bar is hidden
        // and no overlay is used, so the window controls always match the
        // current light/dark theme while native resizing/snapping is retained.
        titleBarStyle: 'hidden',
        icon: path.join(__dirname, 'build', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
        }
    });

    if (winState.maximized) {
        mainWindow.maximize();
    }

    // A compromised renderer must not be able to open windows or navigate the
    // app away from the local server (e.g. to file:// or a phishing site).
    // External links are handed to the OS browser instead.
    const isTrustedLocalUrl = (url) =>
        url.startsWith('http://localhost:8000/') ||
        url.startsWith('http://127.0.0.1:8000/');

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isTrustedLocalUrl(url)) {
            event.preventDefault();
            if (/^https?:\/\//i.test(url)) {
                shell.openExternal(url);
            }
        }
    });

    mainWindow.loadURL('http://localhost:8000/cms.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Custom title bar window controls (frameless window)
    ipcMain.on('window:minimize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.minimize();
    });

    ipcMain.on('window:toggle-maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    });

    ipcMain.on('window:close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.close();
    });

    ipcMain.handle('window:is-maximized', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return win ? win.isMaximized() : false;
    });

    const sendMaximized = (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:maximized', state);
        }
    };
    mainWindow.on('maximize', () => sendMaximized(true));
    mainWindow.on('unmaximize', () => sendMaximized(false));

    // Persist window bounds + maximized state as it changes, and on close.
    const persistWindowState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const isMax = mainWindow.isMaximized();
            const bounds = isMax ? mainWindow.getNormalBounds() : mainWindow.getBounds();
            saveWindowState({
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                maximized: isMax
            });
        }
    };
    mainWindow.on('resize', persistWindowState);
    mainWindow.on('move', persistWindowState);
    mainWindow.on('maximize', persistWindowState);
    mainWindow.on('unmaximize', persistWindowState);
    mainWindow.on('close', persistWindowState);
}

app.whenReady().then(async () => {
    try {
        initializeDataDirectory();
        startServerInProcess();

        // Wait for the server to actually be ready before opening the window
        const http = require('http');
        const waitForServer = () => new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50; // 50 × 200ms = 10 seconds max
            const check = () => {
                attempts++;
                const req = http.get('http://localhost:8000/api/recipes', { headers: { 'Authorization': 'Bearer larder_local_sync_8f92k' } }, (res) => {
                    res.resume(); // drain the response
                    resolve();
                });
                req.on('error', () => {
                    if (attempts < maxAttempts) {
                        setTimeout(check, 200);
                    } else {
                        resolve(); // open window anyway after timeout
                    }
                });
                req.setTimeout(500, () => { req.destroy(); });
            };
            check();
        });

        await waitForServer();
        createWindow();
    } catch (err) {
        dialog.showErrorBox('Larder Error', 'Failed to start: ' + err.message);
        app.quit();
    }

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
