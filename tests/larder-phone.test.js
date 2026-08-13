// Phase 7.2 phone PWA: the /phone/ route must be served with a directory index,
// the webmanifest with the right MIME type, and the service worker + shared
// assets must be fetchable so the PWA can be installed and go offline-cacheable.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'larder_local_sync_8f92k';
const PORT = 8942;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'larder-phone-'));
let server;

function req(pathname, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const opts = { host: '127.0.0.1', port: PORT, path: pathname, method, headers: { Authorization: 'Bearer ' + TOKEN } };
        if (body != null) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
        const q = http.request(opts, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: d })); });
        q.on('error', reject); if (body != null) q.write(body); q.end();
    });
}

before(async () => {
    server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, LARDER_DATA_DIR: DATA, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', d => process.stdout.write('[phonesrv] ' + d));
    for (let i = 0; i < 60; i++) {
        try { const r = await req('/api/settings'); if (r.status === 200) return; } catch (e) { /* retry */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('server did not start');
});

after(() => { try { server.kill(); } catch (e) { /* ignore */ } });

test('/phone/ serves the PWA shell via directory index', async () => {
    const r = await req('/phone/');
    assert.equal(r.status, 200, 'directory index served');
    assert.ok((r.headers['content-type'] || '').includes('text/html'), 'served as HTML');
    assert.ok(r.body.includes('manifest.webmanifest'), 'shell links the manifest');
    assert.ok(r.body.includes('<script src="app.js">'), 'shell loads the phone app');
});

test('/phone (no trailing slash) also resolves to the shell', async () => {
    const r = await req('/phone');
    assert.equal(r.status, 200, 'extensionless /phone served');
    assert.ok(r.body.includes('id="ph-tabs"'), 'body is the PWA shell');
});

test('manifest is served with the webmanifest MIME type', async () => {
    const r = await req('/phone/manifest.webmanifest');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'application/manifest+json', 'correct manifest MIME');
    const m = JSON.parse(r.body);
    assert.equal(m.name, 'Larder');
    assert.ok(Array.isArray(m.icons) && m.icons.some(i => i.sizes === '512x512'), 'installable icon present');
});

test('service worker + phone assets are fetchable', async () => {
    for (const p of ['/phone/sw.js', '/phone/app.js', '/phone/phone.css', '/calc.js', '/sync-client.js', '/images/icon.png']) {
        const r = await req(p);
        assert.equal(r.status, 200, p + ' served');
    }
});

test('API behind /phone still works (shopping list + tick)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const seed = JSON.stringify([{ date: today, items: [{ id: 'p1', name: 'Flour', amount: 500, unit: 'g', checked: false }] }]);
    assert.equal((await req('/api/shoppinglists', 'PUT', seed)).status, 200);
    const t = await req('/api/shoppinglists/tick', 'POST', JSON.stringify({ date: today, itemId: 'p1', checked: true }));
    assert.equal(t.status, 200, 'phone can tick the shared list');
    const g = await req('/api/shoppinglists');
    const rec = JSON.parse(g.body).find(x => x.date === today);
    assert.equal(rec.items.find(i => i.id === 'p1').checked, true, 'flip persisted');
});