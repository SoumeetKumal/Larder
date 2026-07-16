const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = __dirname;
const RECIPES_PATH = path.join(ROOT, 'data', 'recipes.json');
const INGREDIENTS_PATH = path.join(ROOT, 'data', 'ingredients.json');
const API_KEY = 'larder_local_sync_8f92k';

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

server.listen(PORT, () => {
    console.log('');
    console.log('  🍽️  Larder is running!');
    console.log(`  📡 Local:  http://localhost:${PORT}`);
    console.log(`  📝 CMS:    http://localhost:${PORT}/cms.html`);
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');

    // Auto-open browser
    const { exec } = require('child_process');
    const url = `http://localhost:${PORT}`;
    const platform = process.platform;
    if (platform === 'win32') exec(`start ${url}`);
    else if (platform === 'darwin') exec(`open ${url}`);
    else exec(`xdg-open ${url}`);
});
