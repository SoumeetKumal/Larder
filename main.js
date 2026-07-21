const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Determine the user data directory for storing JSON files
// This resolves to %APPDATA%/Larder on Windows
const USER_DATA_DIR = path.join(app.getPath('userData'), 'data');

// List of data files that the server reads/writes
const DATA_FILES = [
    'recipes.json',
    'ingredients.json',
    'mealplans.json',
    'pantry.json',
    'shoppinglists.json'
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
                // Create an empty JSON array as fallback
                fs.writeFileSync(destPath, '[]', 'utf8');
                console.log(`[Larder] Created empty: ${file}`);
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
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        title: 'Larder',
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0b0f19', // Matches var(--bg-base)
            symbolColor: '#f9fafb', // Matches var(--text-primary)
            height: 38
        },
        icon: path.join(__dirname, 'images', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadURL('http://localhost:8000/cms.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    try {
        initializeDataDirectory();
        startServerInProcess();

        // Give the server a moment to bind the port, then open the window
        setTimeout(() => {
            createWindow();
        }, 500);
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
