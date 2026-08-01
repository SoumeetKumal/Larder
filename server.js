const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const AdmZip = require('adm-zip');

const PORT = 8000;
// Bind to loopback only. Larder is a personal, local-first app: exposing the
// API to the network would let any LAN peer read/overwrite data.
const HOST = '127.0.0.1';
const ROOT = __dirname;
const DATA_DIR = global.LARDER_DATA_DIR || path.join(ROOT, 'data');
const RECIPES_PATH = path.join(DATA_DIR, 'recipes.json');
const INGREDIENTS_PATH = path.join(DATA_DIR, 'ingredients.json');
const MEALPLANS_PATH = path.join(DATA_DIR, 'mealplans.json');
const PANTRY_PATH = path.join(DATA_DIR, 'pantry.json');
const SHOPPINGLISTS_PATH = path.join(DATA_DIR, 'shoppinglists.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const API_KEY = 'larder_local_sync_8f92k';

// Maximum request body size (uploads + data writes). 50 MB is plenty for
// recipe data and a backup archive.
const MAX_BODY_BYTES = 50 * 1024 * 1024;

// Only same-origin / loopback origins may read the API. A browser page served
// from another origin must NOT be able to fetch localhost data (CSRF).
const ALLOWED_ORIGINS = new Set([
    'http://localhost:8000',
    'http://127.0.0.1:8000'
]);

// Content-Security-Policy sent on every response. lucide is self-hosted, so
// scripts come from 'self'. Inline styles/handlers are used throughout the
// UI, hence 'unsafe-inline' for style; object/embed are blocked outright.
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "worker-src 'self' blob:"
].join('; ');

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
Object.entries(defaultFiles).forEach(([file, content]) => {
    const p = path.join(DATA_DIR, file);
    if (!fs.existsSync(p)) {
        fs.writeFileSync(p, content, 'utf8');
        console.log(`  🌱 Seeded ${file}`);
    }
});

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

function safeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

// Collect a request body with a hard size cap. Rejects oversized bodies.
function collectBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let done = false;
        req.on('data', chunk => {
            if (done) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                done = true;
                req.destroy();
                reject(new Error('Body too large'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (!done) resolve(Buffer.concat(chunks));
        });
        req.on('error', err => reject(err));
    });
}

function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
    // --- Security headers on every response ---
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);

    // --- CORS: only echo allow-listed loopback origins; never '*' ---
    const origin = req.headers['origin'];
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- API authentication (all /api/ routes) ---
    if (req.url.startsWith('/api/')) {
        const auth = req.headers['authorization'] || '';
        if (!safeEqual(auth, `Bearer ${API_KEY}`)) {
            sendJson(res, 401, { error: 'Unauthorized: Invalid or missing API key' });
            return;
        }
    }

    // --- API: GET recipes ---
    if (req.method === 'GET' && req.url === '/api/recipes') {
        fs.readFile(RECIPES_PATH, 'utf8', (err, data) => {
            if (err) {
                sendJson(res, 500, { error: 'Could not read recipes.json' });
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
        return;
    }

    // --- API: PUT (save) recipes ---
    if (req.method === 'PUT' && req.url === '/api/recipes') {
        collectBody(req).then(body => {
            try {
                const parsed = JSON.parse(body.toString('utf8'));
                if (!Array.isArray(parsed)) throw new Error('Expected an array');
                const formatted = JSON.stringify(parsed, null, 2);
                fs.writeFile(RECIPES_PATH, formatted, 'utf8', (err) => {
                    if (err) {
                        sendJson(res, 500, { error: 'Could not write recipes.json' });
                        return;
                    }
                    sendJson(res, 200, { success: true, count: parsed.length });
                    console.log(`  💾 Saved ${parsed.length} recipe(s) to recipes.json`);
                });
            } catch (e) {
                sendJson(res, 400, { error: 'Invalid JSON or payload must be an array' });
            }
        }).catch(() => {
            sendJson(res, 413, { error: 'Request body too large' });
        });
        return;
    }

    // --- API: GET ingredients ---
    if (req.method === 'GET' && req.url === '/api/ingredients') {
        fs.readFile(INGREDIENTS_PATH, 'utf8', (err, data) => {
            if (err) {
                sendJson(res, 500, { error: 'Could not read ingredients.json' });
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
        return;
    }

    // --- API: PUT (save) ingredients ---
    if (req.method === 'PUT' && req.url === '/api/ingredients') {
        collectBody(req).then(body => {
            try {
                const parsed = JSON.parse(body.toString('utf8'));
                if (!Array.isArray(parsed)) throw new Error('Expected an array');
                const formatted = JSON.stringify(parsed, null, 2);
                fs.writeFile(INGREDIENTS_PATH, formatted, 'utf8', (err) => {
                    if (err) {
                        sendJson(res, 500, { error: 'Could not write ingredients.json' });
                        return;
                    }
                    sendJson(res, 200, { success: true, count: parsed.length });
                    console.log(`  💾 Saved ${parsed.length} ingredient(s) to ingredients.json`);
                });
            } catch (e) {
                sendJson(res, 400, { error: 'Invalid JSON or payload must be an array' });
            }
        }).catch(() => {
            sendJson(res, 413, { error: 'Request body too large' });
        });
        return;
    }

    // --- MEAL PLANNER API ENDPOINTS ---
    function handleGenericFileAPI(req, res, filePath, name) {
        if (req.method === 'GET') {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end('[]');
                        return;
                    }
                    sendJson(res, 500, { error: `Could not read ${name}.json` });
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            });
            return true;
        }
        if (req.method === 'PUT') {
            collectBody(req).then(body => {
                try {
                    const parsed = JSON.parse(body.toString('utf8'));
                    if (!Array.isArray(parsed)) throw new Error('Expected an array');
                    const formatted = JSON.stringify(parsed, null, 2);
                    fs.writeFile(filePath, formatted, 'utf8', (err) => {
                        if (err) {
                            sendJson(res, 500, { error: `Could not write ${name}.json` });
                            return;
                        }
                        sendJson(res, 200, { success: true, count: parsed.length });
                        console.log(`  💾 Saved ${parsed.length} record(s) to ${name}.json`);
                    });
                } catch (e) {
                    sendJson(res, 400, { error: 'Invalid JSON or payload must be an array' });
                }
            }).catch(() => {
                sendJson(res, 413, { error: 'Request body too large' });
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
            sendJson(res, 500, { error: 'Export failed' });
        }
        return;
    }

    if (req.url === '/api/import' && req.method === 'POST') {
        collectBody(req).then(buffer => {
            try {
                const zip = new AdmZip(buffer);
                // Zip-slip protection: refuse any entry that would resolve
                // outside DATA_DIR (e.g. entries named ../../evil).
                const dataPrefix = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
                zip.getEntries().forEach(entry => {
                    const clean = entry.entryName.replace(/\\/g, '/');
                    const target = path.resolve(DATA_DIR, clean);
                    if (target !== DATA_DIR && !target.startsWith(dataPrefix)) {
                        throw new Error('Blocked unsafe archive entry: ' + entry.entryName);
                    }
                });
                zip.extractAllTo(DATA_DIR, true);
                sendJson(res, 200, { success: true });
                console.log(`  📥 Imported data archive successfully`);
            } catch (e) {
                console.error(e);
                sendJson(res, 400, { error: 'Import failed or invalid zip' });
            }
        }).catch((e) => {
            if (e && e.message === 'Body too large') {
                sendJson(res, 413, { error: 'Request body too large' });
            } else {
                sendJson(res, 400, { error: 'Import failed or invalid zip' });
            }
        });
        return;
    }

    // Static file serving
    let urlPath = req.url.split('?')[0]; // strip query params
    try { urlPath = decodeURIComponent(urlPath); } catch (e) { /* keep as-is on malformed input */ }
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(ROOT, urlPath));

    // Security: prevent path traversal. Using path.relative is more robust
    // than a startsWith check (handles '..', drive prefixes, siblings).
    const rel = path.relative(ROOT, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
    }

    // If no extension, try appending .html (e.g. /cms → /cms.html)
    let ext = path.extname(filePath).toLowerCase();
    if (!ext) {
        const withHtml = filePath + '.html';
        if (fs.existsSync(withHtml) && fs.statSync(withHtml).isFile()) {
            return fs.readFile(withHtml, (err, data) => {
                if (err) { sendJson(res, 500, { error: 'Server Error' }); return; }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            });
        }
        sendJson(res, 404, { error: 'Not Found' });
        return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                sendJson(res, 404, { error: 'Not Found' });
            } else {
                sendJson(res, 500, { error: 'Server Error' });
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  🍽️  Larder is running!');
    console.log(`  📡 Local:   http://localhost:${PORT}`);
    console.log(`  📝 CMS:     http://localhost:${PORT}/cms.html`);
    console.log('  🔒 Bound to 127.0.0.1 only — not reachable from the network.');
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
