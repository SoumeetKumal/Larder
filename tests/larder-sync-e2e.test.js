// End-to-end two-"tab" LAN-sync test: boots TWO full CMS instances (real
// cms.html + modules in jsdom, with Node's WebSocket/fetch injected so they talk
// to a real spawned server), then ticks a shopping item in tab A via a real DOM
// checkbox click and asserts tab B repaints it live. This is the automated stand-in
// for the manual "two browser tabs act as two devices" gate.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOKEN = 'larder_local_sync_8f92k';
const PORT = 8943;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'larder-e2e-'));
const TODAY = new Date().toISOString().split('T')[0];
let server;

function serverReq(pathname, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const opts = { hostname: '127.0.0.1', port: PORT, path: pathname, method, headers: { Authorization: 'Bearer ' + TOKEN } };
        if (body != null) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
        const q = require('http').request(opts, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
        q.on('error', reject); if (body != null) q.write(body); q.end();
    });
}

before(async () => {
    server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, LARDER_DATA_DIR: DATA, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stderr.on('data', d => process.stderr.write('[e2esrv] ' + d));
    for (let i = 0; i < 60; i++) {
        try { const r = await serverReq('/api/settings'); if (r.status === 200) return; } catch (e) { /* retry */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('server did not start');
});

after(() => {
    try { server.kill(); } catch (e) { /* ignore */ }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootCmsTab() {
    const html = fs.readFileSync(path.join(ROOT, 'cms.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:' + PORT + '/cms.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    window.WebSocket = globalThis.WebSocket;
    window.fetch = (url, opts = {}) => {
        return globalThis.fetch('http://127.0.0.1:' + PORT + String(url), opts);
    };
    window.lucide = { createIcons: () => {} };
    window.alert = () => {};
    window.confirm = () => true;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    for (const f of ['calc.js', 'cms-utils.js', 'cms-state.js', 'cms-receipts.js', 'cms-planner.js', 'sync-client.js', 'cms.js']) {
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    for (let i = 0; i < 60 && window.document.readyState !== 'complete'; i++) await sleep(5);
    await sleep(300); // let loadData + first render finish
    const tab = window.document.querySelector('.cms-tab[data-tab="shopping"]');
    assert.ok(tab, 'shopping tab present');
    tab.click();
    await sleep(50);
    return { dom, window };
}

test('tick in tab A repaints tab B live over a real server WS', async () => {
    const seed = JSON.stringify([{ date: TODAY, items: [
        { id: 'e1', name: 'Eggs', amount: 12, unit: 'unit', checked: false },
        { id: 'e2', name: 'Milk', amount: 2, unit: 'L', checked: false }
    ] }]);
    const put = await serverReq('/api/shoppinglists', 'PUT', seed);
    assert.equal(put.status, 200, 'seed saved');

    const A = await bootCmsTab();
    const B = await bootCmsTab();
    try {
        const rowsA = A.window.document.querySelectorAll('.vd-shop-item');
        const rowsB = B.window.document.querySelectorAll('.vd-shop-item');
        assert.equal(rowsA.length, 2, 'tab A rendered the list');
        assert.equal(rowsB.length, 2, 'tab B rendered the list');
        assert.ok(!rowsA[0].classList.contains('checked'), 'tab A starts unchecked');

        A.window.document.querySelector('.vd-shop-item .vd-shop-checkbox').click();
        await sleep(1000);

        const rowsB2 = B.window.document.querySelectorAll('.vd-shop-item');
        const bFirst = rowsB2[0];
        assert.ok(bFirst.classList.contains('checked'), 'tab B repainted the ticked item as checked');
        assert.equal(bFirst.querySelector('.vd-shop-checkbox').getAttribute('aria-checked'), 'true', 'tab B aria reflects the flip');

        const rowsA2 = A.window.document.querySelectorAll('.vd-shop-item');
        assert.ok(rowsA2[0].classList.contains('checked'), 'tab A shows its own optimistic flip');

        const g = await serverReq('/api/shoppinglists');
        const item = JSON.parse(g.body).find(r => r.date === TODAY).items.find(i => i.id === 'e1');
        assert.equal(item.checked, true, 'tick persisted on the server');
    } finally {
        A.window.close();
        B.window.close();
    }
});