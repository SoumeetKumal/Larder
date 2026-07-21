const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const AdmZip = require('adm-zip');

const PORT = 8000;
const ROOT = __dirname;
const DATA_DIR = global.LARDER_DATA_DIR || path.join(ROOT, 'data');
const RECIPES_PATH = path.join(DATA_DIR, 'recipes.json');
const INGREDIENTS_PATH = path.join(DATA_DIR, 'ingredients.json');
const MEALPLANS_PATH = path.join(DATA_DIR, 'mealplans.json');
const PANTRY_PATH = path.join(DATA_DIR, 'pantry.json');
const SHOPPINGLISTS_PATH = path.join(DATA_DIR, 'shoppinglists.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const API_KEY = 'larder_local_sync_8f92k';

// Initialize data directory
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Seed default files if missing
const defaultFiles = {
    'recipes.json': '[]',
    'ingredients.json': '[]',
    'mealplans.json': '[]',
    'pantry.json': '[]',
    'shoppinglists.json': '[]',
    'settings.json': '{"profiles": [{"name": "User", "calories": 2000, "carbs": 40, "protein": 30, "fat": 30}]}'
};

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
    // CORS headers for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Security: Require API key for all /api/ endpoints
    if (req.url.startsWith('/api/')) {
        const auth = req.headers['authorization'];
        if (auth !== `Bearer ${API_KEY}`) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' }));
            return;
        }
    }

    // API: GET recipes
    if (req.method === 'GET' && req.url === '/api/recipes') {
        fs.readFile(RECIPES_PATH, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Could not read recipes.json' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
        return;
    }

    // API: PUT (save) recipes
    if (req.method === 'PUT' && req.url === '/api/recipes') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                // Validate JSON
                const parsed = JSON.parse(body);
                const formatted = JSON.stringify(parsed, null, 2);
                fs.writeFile(RECIPES_PATH, formatted, 'utf8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Could not write recipes.json' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, count: parsed.length }));
                    console.log(`  💾 Saved ${parsed.length} recipe(s) to recipes.json`);
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // API: GET ingredients
    if (req.method === 'GET' && req.url === '/api/ingredients') {
        fs.readFile(INGREDIENTS_PATH, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Could not read ingredients.json' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
        return;
    }

    // API: PUT (save) ingredients
    if (req.method === 'PUT' && req.url === '/api/ingredients') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const formatted = JSON.stringify(parsed, null, 2);
                fs.writeFile(INGREDIENTS_PATH, formatted, 'utf8', (err) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Could not write ingredients.json' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, count: parsed.length }));
                    console.log(`  💾 Saved ${parsed.length} ingredient(s) to ingredients.json`);
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // --- MEAL PLANNER API ENDPOINTS ---
    function handleGenericFileAPI(req, res, filePath, name) {
        if (req.method === 'GET') {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    // If file doesn't exist yet, return empty array
                    if (err.code === 'ENOENT') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end('[]');
                        return;
                    }
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Could not read ${name}.json` }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            });
            return true;
        }
        if (req.method === 'PUT') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const formatted = JSON.stringify(parsed, null, 2);
                    fs.writeFile(filePath, formatted, 'utf8', (err) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: `Could not write ${name}.json` }));
                            return;
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, count: parsed.length }));
                        console.log(`  💾 Saved ${parsed.length} record(s) to ${name}.json`);
                    });
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return true;
        }
        return false;
    }

    if (req.url === '/api/mealplans' && handleGenericFileAPI(req, res, MEALPLANS_PATH, 'mealplans')) return;
    if (req.url === '/api/pantry' && handleGenericFileAPI(req, res, PANTRY_PATH, 'pantry')) return;
    if (req.url === '/api/shoppinglists' && handleGenericFileAPI(req, res, SHOPPINGLISTS_PATH, 'shoppinglists')) return;
    if (req.url === '/api/settings' && handleGenericFileAPI(req, res, SETTINGS_PATH, 'settings')) return;

    if (req.url === '/api/export' && req.method === 'GET') {
        try {
            const zip = new AdmZip();
            zip.addLocalFolder(DATA_DIR);
            const buffer = zip.toBuffer();
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename=larder_backup.zip',
                'Content-Length': buffer.length
            });
            res.end(buffer);
            console.log(`  📦 Exported data archive`);
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Export failed' }));
        }
        return;
    }

    if (req.url === '/api/import' && req.method === 'POST') {
        let buffers = [];
        req.on('data', chunk => buffers.push(chunk));
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(buffers);
                const zip = new AdmZip(buffer);
                zip.extractAllTo(DATA_DIR, true);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                console.log(`  📥 Imported data archive successfully`);
            } catch (e) {
                console.error(e);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Import failed or invalid zip' }));
            }
        });
        return;
    }

    // Static file serving
    let urlPath = req.url.split('?')[0]; // strip query params
    if (urlPath === '/') urlPath = '/index.html';
    let filePath = path.join(ROOT, urlPath);

    // Security: prevent path traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // If no extension, try appending .html (e.g. /cms → /cms.html)
    let ext = path.extname(filePath).toLowerCase();
    if (!ext) {
        filePath += '.html';
        ext = '.html';
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    // Get local IP address for display
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIp = 'localhost';
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
                break;
            }
        }
    }

    console.log('');
    console.log('  🍽️  Larder is running!');
    console.log(`  📡 Local IP: http://${localIp}:${PORT}`);
    console.log(`  📝 CMS:      http://${localIp}:${PORT}/cms.html`);
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');

    // Auto-open browser (only when NOT inside Electron)
    if (!global.LARDER_IS_ELECTRON) {
        const { exec } = require('child_process');
        const url = `http://localhost:${PORT}`;
        const platform = process.platform;
        if (platform === 'win32') exec(`start ${url}`);
        else if (platform === 'darwin') exec(`open ${url}`);
        else exec(`xdg-open ${url}`);
    }
});
