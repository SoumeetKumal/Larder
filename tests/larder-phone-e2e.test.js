// End-to-end cross-device sync test: ONE real CMS instance (cms.html) and ONE
// real phone PWA instance (phone/index.html), both in jsdom with Node's real
// WebSocket + fetch injected so they talk to a live spawned server. This is the
// automated stand-in for the Phase 7 acceptance: "two devices on the same Wi-Fi
// share one live shopping list; both can tick." A DOM checkbox click on the phone
// must repaint the CMS, and a CMS tick must repaint the phone.
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
const PORT = 8945;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'larder-device-e2e-'));
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
    server.stderr.on('data', d => process.stderr.write('[devsrv] ' + d));
    for (let i = 0; i < 60; i++) {
        try { const r = await serverReq('/api/settings'); if (r.status === 200) return; } catch (e) { /* retry */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('server did not start');
});

after(() => { try { server.kill(); } catch (e) { /* ignore */ } });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function liveFetch(window) {
    window.fetch = (url, opts = {}) => {
        return globalThis.fetch('http://127.0.0.1:' + PORT + String(url), opts);
    };
}

async function bootPhone() {
    const html = fs.readFileSync(path.join(ROOT, 'phone', 'index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:' + PORT + '/phone/', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    window.WebSocket = globalThis.WebSocket;
    liveFetch(window);
    for (const f of ['calc.js', 'sync-client.js', path.join('phone', 'app.js')]) {
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    for (let i = 0; i < 80 && window.document.readyState !== 'complete'; i++) await sleep(5);
    await sleep(300);
    return { dom, window };
}

async function bootCms() {
    const html = fs.readFileSync(path.join(ROOT, 'cms.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:' + PORT + '/cms.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    window.WebSocket = globalThis.WebSocket;
    liveFetch(window);
    window.lucide = { createIcons: () => {} };
    window.alert = () => {};
    window.confirm = () => true;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    for (const f of ['calc.js', 'cms-utils.js', 'cms-state.js', 'cms-receipts.js', 'cms-planner.js', 'sync-client.js', 'cms.js']) {
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    for (let i = 0; i < 80 && window.document.readyState !== 'complete'; i++) await sleep(5);
    await sleep(300);
    const tab = window.document.querySelector('.cms-tab[data-tab="shopping"]');
    assert.ok(tab, 'CMS shopping tab present');
    tab.click();
    await sleep(50);
    return { dom, window };
}

test('phone tick repaints the CMS live; CMS tick repaints the phone', async () => {
    const seed = JSON.stringify([{ date: TODAY, items: [
        { id: 'd1', name: 'Rice', amount: 2000, unit: 'g', checked: false },
        { id: 'd2', name: 'Oil', amount: 1, unit: 'L', checked: false }
    ] }]);
    assert.equal((await serverReq('/api/shoppinglists', 'PUT', seed)).status, 200, 'seed saved');

    const phone = await bootPhone();
    const cms = await bootCms();
    try {
        // Both render the two-item list.
        assert.equal(phone.window.document.querySelectorAll('#list-items .ph-item').length, 2, 'phone rendered the list');
        assert.equal(cms.window.document.querySelectorAll('.vd-shop-item').length, 2, 'CMS rendered the list');

        // Phone ticks item 0 → CMS must repaint it as checked.
        const phoneBox = phone.window.document.querySelector('#list-items .ph-check[data-idx="0"]');
        assert.equal(phoneBox.getAttribute('aria-checked'), 'false', 'phone starts unchecked');
        phoneBox.click();
        await sleep(1200);

        const cmsRows = cms.window.document.querySelectorAll('.vd-shop-item');
        assert.equal(cmsRows.length, 2, 'CMS list still intact after broadcast');
        assert.ok(cmsRows[0].classList.contains('checked'), 'CMS saw the phone tick as checked');
        assert.equal(cmsRows[0].querySelector('.vd-shop-checkbox').getAttribute('aria-checked'), 'true', 'CMS aria reflects it');

        // CMS ticks the OTHER item (index 1) → phone must repaint it.
        const cmsBox = cmsRows[1].querySelector('.vd-shop-checkbox');
        cmsBox.click();
        await sleep(1200);

        const phoneRows = phone.window.document.querySelectorAll('#list-items .ph-item');
        assert.equal(phoneRows.length, 2, 'phone list intact');
        const second = phoneRows[1];
        assert.ok(second.classList.contains('checked'), 'phone saw the CMS tick as checked');
        assert.equal(second.querySelector('.ph-check').getAttribute('aria-checked'), 'true', 'phone aria reflects it');

        // Server state converged for both flips.
        const g = await serverReq('/api/shoppinglists');
        const items = JSON.parse(g.body).find(r => r.date === TODAY).items;
        assert.equal(items.find(i => i.id === 'd1').checked, true, 'd1 persisted');
        assert.equal(items.find(i => i.id === 'd2').checked, true, 'd2 persisted');
    } finally {
        phone.window.close();
        cms.window.close();
    }
});