const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');

const PORT = 8000;
const ROOT = __dirname;
const DATA_DIR = global.LARDER_DATA_DIR || process.env.LARDER_DATA_DIR || path.join(ROOT, 'data');
// Bind to loopback only by default. Larder is a personal, local-first app:
// exposing the API to the network would let any LAN peer read/overwrite data.
// When settings.json has network.allowLan === true (or env LARDER_ALLOW_LAN=1),
// the server binds to 0.0.0.0 so companion apps on the same Wi-Fi (e.g.
// FitTrack) can sync against this machine's LAN IP. API calls still require
// the Bearer token on every /api route.
const ALLOW_LAN = (() => {
    if (process.env.LARDER_ALLOW_LAN === '1') return true;
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8'));
        return !!(cfg.network && cfg.network.allowLan);
    } catch (e) {
        return false;
    }
})();
const HOST = ALLOW_LAN ? '0.0.0.0' : '127.0.0.1';

// Return this machine's LAN IPv4 addresses (for companion-app sync), sorted so
// the most likely "real" adapter (Wi-Fi / Ethernet) comes first, with virtual
// adapters (VirtualBox, WSL, Docker, VPN) deprioritized or filtered out.
function getLanAddresses() {
    const nets = os.networkInterfaces();
    const VIRTUAL_HINTS = ['virtualbox', 'vmware', 'hyper-v', 'vethernet', 'docker', 'vbox', 'loopback', 'tailscale', 'zerotier', 'hamachi', 'wsl', 'vmware'];
    const candidates = [];
    Object.keys(nets).forEach(name => {
        const lower = name.toLowerCase();
        (nets[name] || []).forEach(a => {
            if (a.family !== 'IPv4' || a.internal || a.address === '127.0.0.1') return;
            const isVirtual = VIRTUAL_HINTS.some(h => lower.includes(h));
            // WSL interfaces often look like "Local Area Connection* N" or vEthernet
            const isWsl = lower.includes('local area connection') || /^veth/i.test(lower);
            let score = 0;
            if (/wi-?fi|wlan/.test(lower)) score += 4;
            if (/ethernet/.test(lower)) score += 2;
            if (isWsl) score -= 5;
            if (isVirtual) score -= 5;
            // Physical default-route style subnets rank higher than VM/VPN ranges
            if (/^192\.168\./.test(a.address)) score += 1;
            if (/^10\./.test(a.address)) score += 1;
            if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 1;
            candidates.push({ address: a.address, score });
        });
    });
    candidates.sort((x, y) => y.score - x.score);
    return candidates.map(c => c.address);
}

const RECIPES_PATH = path.join(DATA_DIR, 'recipes.json');
const INGREDIENTS_PATH = path.join(DATA_DIR, 'ingredients.json');
const MEALPLANS_PATH = path.join(DATA_DIR, 'mealplans.json');
const PANTRY_PATH = path.join(DATA_DIR, 'pantry.json');
const PANTRY_ITEMS_PATH = path.join(DATA_DIR, 'pantry-items.json');
const SHOPPINGLISTS_PATH = path.join(DATA_DIR, 'shoppinglists.json');
const HOUSEHOLD_PATH = path.join(DATA_DIR, 'household.json');
const RECEIPTS_PATH = path.join(DATA_DIR, 'receipts.json');
const PLANNER_PATH = path.join(DATA_DIR, 'planner.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const EXERCISES_PATH = path.join(DATA_DIR, 'exercises.json');
const WORKOUT_TEMPLATES_PATH = path.join(DATA_DIR, 'workoutTemplates.json');
const PRODUCT_PREFS_PATH = path.join(DATA_DIR, 'product-prefs.json');
const API_KEY = 'larder_local_sync_8f92k';

// The only files Larder keeps as user data. Used by /api/export to produce a
// clean bundle and by /api/import to whitelist acceptable files on restore.
const DATA_FILES = [
    'recipes.json', 'ingredients.json', 'mealplans.json',
    'pantry.json', 'pantry-items.json', 'shoppinglists.json', 'household.json',
    'receipts.json', 'consumption.json', 'planner.json', 'settings.json',
    'exercises.json', 'workoutTemplates.json', 'product-prefs.json'
];
const KNOWN_DATA_FILES = new Set(DATA_FILES);

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
    'pantry-items.json': '[]',
    'shoppinglists.json': '[]',
    'household.json': '[]',
    'receipts.json': '[]',
    'consumption.json': '[]',
    'planner.json': '{"goals": {"energyMax": 0, "carbsMax": 0, "fatMax": 0, "satFatMax": 0, "sugarMax": 0, "proteinMin": 0, "vitDMin": 0, "meatProteinPct": 50, "budget": 0, "currency": "MUR"}, "items": []}',
    'settings.json': '{"profiles": [{"name": "User", "calories": 2000, "carbs": 40, "protein": 30, "fat": 30}]}',
    'exercises.json': '[]',
    'workoutTemplates.json': '[]',
    'product-prefs.json': '[]'
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
    // Query strings are stripped up-front so cache-busting URLs like
    // "/api/recipes?_=123" still match the exact-path routes below.
    req.url = req.url.split('?')[0];

    // --- Security headers on every response ---
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);

    // --- CORS: only echo allow-listed loopback origins; never '*' ---
    const origin = req.headers['origin'];
    const originAllowed = origin && (ALLOWED_ORIGINS.has(origin) || (ALLOW_LAN && /^https?:\/\/\d{1,3}(\.\d{1,3}){3}:\d+$/.test(origin)));
    if (originAllowed) {
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

    // --- API responses must never be cached. Without explicit cache-control
    // the browser applies heuristic caching to GET /api/*, so edits made in the
    // CMS would keep showing stale data on the public pages. ---
    if (req.url.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store');
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
                const check = validateWrite('recipes', parsed);
                if (!check.ok) { sendJson(res, 400, { error: check.error }); return; }
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
                const check = validateWrite('ingredients', parsed);
                if (!check.ok) { sendJson(res, 400, { error: check.error }); return; }
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
                    const check = validateWrite(name, parsed);
                    if (!check.ok) { sendJson(res, 400, { error: check.error }); return; }
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

    // --- Write-time validation (lenient: rejects malformed records, tolerates
    // missing optional fields so existing data keeps working) ---
    function validateWrite(name, parsed) {
        const badObject = (v) => !v || typeof v !== 'object' || Array.isArray(v);
        const err = (m) => ({ ok: false, error: m });
        if (name === 'planner' || name === 'settings') {
            if (badObject(parsed)) return err(`${name} payload must be an object`);
            if (name === 'planner') {
                if (badObject(parsed.goals)) return err('planner.goals must be an object');
                if (!Array.isArray(parsed.items)) return err('planner.items must be an array');
                for (const it of parsed.items) {
                    if (badObject(it) || typeof it.ingredientId !== 'string' || !it.ingredientId) return err('planner items need a non-empty ingredientId');
                }
            } else if (!Array.isArray(parsed.profiles)) {
                return err('settings.profiles must be an array');
            }
            return { ok: true };
        }
        if (!Array.isArray(parsed)) return err(`${name} payload must be an array`);
        const records = parsed;
        if (name === 'ingredients' || name === 'pantry' || name === 'pantry-items') {
            for (const r of records) {
                if (badObject(r)) return err(`${name} records must be objects`);
                if (name === 'pantry-items') {
                    if (typeof r.pantryId !== 'string' || !r.pantryId) return err('pantry-items records need a non-empty pantryId');
                    if (typeof r.ingredientFoodId !== 'string' || !r.ingredientFoodId) return err('pantry-items records need a non-empty ingredientFoodId');
                } else if (typeof r.foodId !== 'string' || !r.foodId) {
                    return err(`${name} records need a non-empty foodId`);
                }
            }
        } else if (name === 'receipts') {
            for (const r of records) {
                if (badObject(r)) return err('receipts records must be objects');
                if (r.items !== undefined && !Array.isArray(r.items)) return err('receipt.items must be an array');
                if (r.items !== undefined) for (const it of r.items) {
                    if (badObject(it) || typeof it.name !== 'string' || !it.name) return err('receipt items need a non-empty name');
                }
            }
        } else if (name === 'exercises') {
            for (const r of records) {
                if (badObject(r)) return err('exercises records must be objects');
                if (typeof r.name !== 'string' || !r.name) return err('exercises need a non-empty name');
                if (r.primaryMuscle != null && typeof r.primaryMuscle !== 'string') return err('exercise.primaryMuscle must be a string');
                if (r.secondaryMuscles != null && typeof r.secondaryMuscles !== 'string') return err('exercise.secondaryMuscles must be a string');
                if (r.equipment != null && typeof r.equipment !== 'string') return err('exercise.equipment must be a string');
            }
        } else if (name === 'workoutTemplates') {
            for (const r of records) {
                if (badObject(r)) return err('workoutTemplates records must be objects');
                if (typeof r.name !== 'string' || !r.name) return err('workout templates need a non-empty name');
                if (!Array.isArray(r.days)) return err('workout template.days must be an array');
                for (const d of r.days) {
                    if (badObject(d)) return err('template days must be objects');
                    if (!Array.isArray(d.exercises)) return err('template day.exercises must be an array');
                    for (const e of d.exercises) {
                        if (badObject(e) || typeof e.name !== 'string' || !e.name) return err('template exercises need a non-empty name');
                        if (e.sets != null && typeof e.sets !== 'number') return err('template exercise.sets must be a number');
                    }
                }
            }
        } else {
            for (const r of records) {
                if (badObject(r)) return err(`${name} records must be objects`);
            }
        }
        if (name === 'product-prefs') {
            for (const r of records) {
                if (typeof r.foodId !== 'string' || !r.foodId) return err('product-prefs records need a non-empty foodId');
                if (typeof r.pantryId !== 'string' || !r.pantryId) return err('product-prefs records need a non-empty pantryId');
            }
        }
        return { ok: true };
    }

    if (req.url === '/api/mealplans' && handleGenericFileAPI(req, res, MEALPLANS_PATH, 'mealplans')) return;
    if (req.url === '/api/pantry' && handleGenericFileAPI(req, res, PANTRY_PATH, 'pantry')) return;
    if (req.url === '/api/pantry-items' && handleGenericFileAPI(req, res, PANTRY_ITEMS_PATH, 'pantry-items')) return;
    if (req.url === '/api/shoppinglists' && handleGenericFileAPI(req, res, SHOPPINGLISTS_PATH, 'shoppinglists')) return;
    if (req.url === '/api/household' && handleGenericFileAPI(req, res, HOUSEHOLD_PATH, 'household')) return;
    if (req.url === '/api/receipts' && handleGenericFileAPI(req, res, RECEIPTS_PATH, 'receipts')) return;
    if (req.url === '/api/consumption' && handleGenericFileAPI(req, res, path.join(DATA_DIR, 'consumption.json'), 'consumption')) return;
    if (req.url === '/api/exercises' && handleGenericFileAPI(req, res, EXERCISES_PATH, 'exercises')) return;
    if (req.url === '/api/workout-templates' && handleGenericFileAPI(req, res, WORKOUT_TEMPLATES_PATH, 'workoutTemplates')) return;
    if (req.url === '/api/product-prefs' && handleGenericFileAPI(req, res, PRODUCT_PREFS_PATH, 'product-prefs')) return;

    // --- API: planner (object payload: { goals, items }) ---
    if (req.url === '/api/planner' && req.method === 'GET') {
        fs.readFile(PLANNER_PATH, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"goals": {},"items": []}');
                    return;
                }
                sendJson(res, 500, { error: 'Could not read planner.json' });
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
        return;
    }
    if (req.url === '/api/planner' && req.method === 'PUT') {
        collectBody(req).then(body => {
            try {
                const parsed = JSON.parse(body.toString('utf8'));
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object');
                const check = validateWrite('planner', parsed);
                if (!check.ok) { sendJson(res, 400, { error: check.error }); return; }
                const formatted = JSON.stringify(parsed, null, 2);
                fs.writeFile(PLANNER_PATH, formatted, 'utf8', (err) => {
                    if (err) {
                        sendJson(res, 500, { error: 'Could not write planner.json' });
                        return;
                    }
                    sendJson(res, 200, { success: true });
                    console.log(`  💾 Saved planner to planner.json`);
                });
            } catch (e) {
                sendJson(res, 400, { error: 'Invalid JSON or payload must be an object' });
            }
        }).catch(() => {
            sendJson(res, 413, { error: 'Request body too large' });
        });
        return;
    }

    // --- API: network info (LAN addresses for companion-app sync) ---
    if (req.url === '/api/network-info' && req.method === 'GET') {
        sendJson(res, 200, { port: PORT, allowLan: ALLOW_LAN, lanAddresses: getLanAddresses() });
        return;
    }

    // --- API: settings (object payload, unlike the array-based files above) ---
    if (req.url === '/api/settings' && req.method === 'GET') {
        fs.readFile(SETTINGS_PATH, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"profiles": []}');
                    return;
                }
                sendJson(res, 500, { error: 'Could not read settings.json' });
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        });
        return;
    }
    if (req.url === '/api/settings' && req.method === 'PUT') {
        collectBody(req).then(body => {
            try {
                const parsed = JSON.parse(body.toString('utf8'));
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object');
                const check = validateWrite('settings', parsed);
                if (!check.ok) { sendJson(res, 400, { error: check.error }); return; }
                const formatted = JSON.stringify(parsed, null, 2);
                fs.writeFile(SETTINGS_PATH, formatted, 'utf8', (err) => {
                    if (err) {
                        sendJson(res, 500, { error: 'Could not write settings.json' });
                        return;
                    }
                    sendJson(res, 200, { success: true });
                    console.log(`  💾 Saved settings to settings.json`);
                });
            } catch (e) {
                sendJson(res, 400, { error: 'Invalid JSON or payload must be an object' });
            }
        }).catch(() => {
            sendJson(res, 413, { error: 'Request body too large' });
        });
        return;
    }

    if (req.url === '/api/export' && req.method === 'GET') {
        try {
            const zip = new AdmZip();
            // Export only Larder's known JSON data files, so the archive is a
            // clean, portable bundle (no stray temp files or logs).
            let added = 0;
            DATA_FILES.forEach(file => {
                const p = path.join(DATA_DIR, file);
                if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                    zip.addLocalFile(p);
                    added++;
                }
            });
            if (added === 0) throw new Error('No data files to export');
            const buffer = zip.toBuffer();
            const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const fname = `larder-data-${stamp}.zip`;
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=${fname}`,
                'Content-Length': buffer.length
            });
            res.end(buffer);
            console.log(`  📦 Exported ${added} data file(s) to ${fname}`);
        } catch (e) {
            console.error(e);
            sendJson(res, 500, { error: 'Export failed' });
        }
        return;
    }

    if (req.url === '/api/import' && req.method === 'POST') {
        collectBody(req).then(buffer => {
            try {
                const zip = new AdmZip(buffer);
                // Accept only Larder's known data files. This rejects stray files
                // and, together with the zip-slip check below, keeps the import
                // a clean, safe restore into DATA_DIR.
                const entries = zip.getEntries();
                if (!entries.length) throw new Error('Empty archive');
                // Zip-slip protection: refuse any entry that would resolve
                // outside DATA_DIR (e.g. entries named ../../evil).
                const dataPrefix = DATA_DIR.endsWith(path.sep) ? DATA_DIR : DATA_DIR + path.sep;
                entries.forEach(entry => {
                    const clean = entry.entryName.replace(/\\/g, '/');
                    if (path.basename(clean) !== clean) throw new Error('No subfolders allowed');
                    if (!KNOWN_DATA_FILES.has(clean)) throw new Error('Unexpected file: ' + clean);
                    const target = path.resolve(DATA_DIR, clean);
                    if (target !== DATA_DIR && !target.startsWith(dataPrefix)) {
                        throw new Error('Blocked unsafe archive entry: ' + entry.entryName);
                    }
                });
                zip.extractAllTo(DATA_DIR, true);
                sendJson(res, 200, { success: true });
                console.log(`  📥 Imported ${entries.length} data file(s) successfully`);
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

    // --- API: publish current data to the website repo (git add/commit/push) ---
    // The live site (GitHub Pages) only shows data that is committed to the
    // repo's data/ folder, so App copies the live JSON files into <repo>/data
    // and pushes them. The clone lives in the app's own data folder so it
    // survives a "install Larder → import backup → publish" move to a new PC:
    // if the clone is missing it is created automatically from the website
    // remote stored in settings (settings.website). The repo path is stored as
    // settings.website.repoPath; anything else is resolved relative to the app
    // data folder. Credentials come from git's own helpers, or from an optional
    // personal-access token in settings.website.token.
    const WEBSITE_REPO_DIR = path.join(DATA_DIR, '..', 'website-repo');

    const getWebsiteConfig = () => {
        try {
            const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            const w = s.website || {};
            const storedPath = w.repoPath && w.repoPath.trim() ? w.repoPath.trim() : '';
            const pathExists = storedPath && fs.existsSync(path.join(storedPath, '.git'));
            return {
                repoUrl: w.repoUrl || 'https://github.com/SoumeetKumal/Larder.git',
                repoPath: pathExists ? storedPath : WEBSITE_REPO_DIR,
                token: w.token || ''
            };
        } catch (e) {
            return { repoUrl: 'https://github.com/SoumeetKumal/Larder.git', repoPath: WEBSITE_REPO_DIR, token: '' };
        }
    };

    const gitAuthArgs = (token) => {
        if (!token) return [];
        return ['-c', 'credential.helper=', '-c', `http.extraHeader=Authorization: Basic ${Buffer.from('x-access-token:' + token).toString('base64')}`];
    };

    const persistWebsiteRepoPath = (repoPath) => {
        try {
            const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            s.website = s.website || {};
            if (s.website.repoPath !== repoPath) {
                s.website.repoPath = repoPath;
                fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), 'utf8');
            }
        } catch (e) { /* best effort */ }
    };

    if (req.url === '/api/publish' && req.method === 'POST') {
        collectBody(req).then(body => {
            const cfg = getWebsiteConfig();
            let repoPath = cfg.repoPath;
            try {
                const bodyRepoPath = JSON.parse(body.toString('utf8')).repoPath || '';
                if (bodyRepoPath && fs.existsSync(path.join(bodyRepoPath, '.git'))) repoPath = bodyRepoPath;
            } catch (e) { /* fall through */ }
            const run = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
                execFile(cmd, args, { cwd: opts.cwd || repoPath, maxBuffer: 5 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
                    if (err) {
                        // Surface the real git error (rejected push, auth, ...) instead of
                        // only the first line, which is often just "To <url>".
                        const text = (stderr || stdout || err.message).trim();
                        const lines = text.split('\n').filter(l => l.trim() && !/^hint:/i.test(l));
                        reject(new Error(lines.slice(0, 4).join('\n')));
                    } else {
                        resolve((stdout || '').trim());
                    }
                });
            });
            (async () => {
                if (!fs.existsSync(path.join(repoPath, '.git'))) {
                    fs.mkdirSync(path.dirname(repoPath), { recursive: true });
                    await run('git', [...gitAuthArgs(cfg.token), 'clone', cfg.repoUrl, repoPath], { cwd: path.dirname(repoPath) });
                }

                // Sync the working clone with the remote default branch so the push
                // below stays fast-forward even if the remote moved (e.g. edits made
                // on GitHub, or a publish from another PC). Only data files are
                // managed here, so a hard reset never loses app content.
                let remoteBranch = '';
                try {
                    const headRef = (await run('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'])).trim();
                    remoteBranch = headRef.replace(/^refs\/remotes\/origin\//, '');
                } catch (e) { /* fresh/empty clone; fall through */ }
                try { await run('git', ['fetch', 'origin']); } catch (e) { /* offline; best effort */ }
                if (remoteBranch) {
                    try { await run('git', ['reset', '--hard', `origin/${remoteBranch}`]); } catch (e) { /* ignore */ }
                }

                const targetDir = path.join(repoPath, 'data');
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                let copied = 0;
                DATA_FILES.forEach(file => {
                    const src = path.join(DATA_DIR, file);
                    if (fs.existsSync(src)) {
                        fs.copyFileSync(src, path.join(targetDir, file));
                        copied++;
                    }
                });

                // Nothing changed since the last publish — don't create an empty commit.
                const statusOut = await run('git', ['status', '--porcelain']);
                if (!statusOut.trim()) {
                    persistWebsiteRepoPath(repoPath);
                    sendJson(res, 200, { success: true, copied: 0, message: 'Data is already up to date — nothing to publish.' });
                    console.log(`  ⏭️ Nothing to publish to ${repoPath}`);
                    return;
                }

                const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
                await run('git', ['add', 'data']);
                const commitOut = await run('git', ['commit', '-m', `Publish data from Larder CMS (${stamp})`]);
                const pushOut = remoteBranch
                    ? await run('git', [...gitAuthArgs(cfg.token), 'push', 'origin', `HEAD:${remoteBranch}`])
                    : await run('git', [...gitAuthArgs(cfg.token), 'push']);
                persistWebsiteRepoPath(repoPath);
                sendJson(res, 200, { success: true, copied, commit: commitOut, push: pushOut, message: `Published ${copied} data file(s). GitHub Pages will rebuild in a minute.` });
                console.log(`  🚀 Published ${copied} data file(s) to ${repoPath}`);
            })().catch(e => {
                console.error(e);
                sendJson(res, 500, { error: 'Publish failed: ' + e.message });
            });
        }).catch(() => {
            sendJson(res, 413, { error: 'Request body too large' });
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
    if (ALLOW_LAN) {
        const lanIPs = getLanAddresses();
        console.log(`  📡 LAN:     http://${lanIPs[0] || '0.0.0.0'}:${PORT}  (LAN sync ENABLED)`);
    } else {
        console.log('  🔒 Bound to 127.0.0.1 only — not reachable from the network.');
    }
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
