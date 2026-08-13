// Phase 7.1 LAN sync integration test: WS hello, subscribe/broadcast on writes
// and per-item shopping-list ticks. Spawns its own server on a fixed port with a
// temp data dir.
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const TOKEN = 'larder_local_sync_8f92k';
const PORT = 8941;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'larder-sync-'));
let server;

function req(pathname, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const opts = { hostname: '127.0.0.1', port: PORT, path: pathname, method, headers: { Authorization: 'Bearer ' + TOKEN } };
        if (body != null) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(body); }
        const q = http.request(opts, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
        q.on('error', reject); if (body != null) q.write(body); q.end();
    });
}

before(async () => {
    server = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, LARDER_DATA_DIR: DATA, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    server.stdout.on('data', d => process.stdout.write('[syncsrv] ' + d));
    for (let i = 0; i < 60; i++) {
        try { const r = await req('/api/settings'); if (r.status === 200) return; } catch (e) { /* retry */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('server did not start');
});

after(() => { try { server.kill(); } catch (e) { /* ignore */ } });

function mkClient() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
        ws.received = [];
        ws.on('message', m => ws.received.push(m.toString()));
        ws.on('open', () => resolve(ws));
        ws.on('error', reject);
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('ws hello + subscribe + broadcast on dataset write', async () => {
    const A = await mkClient();
    const B = await mkClient();
    A.send(JSON.stringify({ type: 'subscribe', dataset: 'shoppinglists' }));
    await sleep(200);

    const today = new Date().toISOString().slice(0, 10);
    const seed = JSON.stringify([{ date: today, items: [{ id: 'i1', name: 'Flour', qty: 1, unit: 'kg', checked: false }] }]);
    const put = await req('/api/shoppinglists', 'PUT', seed);
    assert.equal(put.status, 200, 'seed PUT accepted');
    await sleep(400);

    const ups = A.received.map(JSON.parse).filter(m => m.type === 'update' && m.dataset === 'shoppinglists');
    assert.ok(ups.length >= 1, 'A received broadcast on shoppinglists write; got: ' + JSON.stringify(A.received));
    const parsed = JSON.parse(ups[ups.length - 1].body);
    assert.equal(parsed[0].items[0].id, 'i1', 'broadcast body carries current dataset content');

    const bGot = B.received.length === 0;
    assert.ok(bGot, 'B (unsubscribed) got nothing: ' + JSON.stringify(B.received));
    A.close(); B.close();
});

test('tick endpoint flips an item and broadcasts', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const A = await mkClient();
    A.send(JSON.stringify({ type: 'subscribe', dataset: 'shoppinglists' }));
    await sleep(200);

    const r = await req('/api/shoppinglists/tick', 'POST', JSON.stringify({ date: today, itemId: 'i1', checked: true }));
    assert.equal(r.status, 200, 'tick accepted: ' + r.body);
    await sleep(400);

    const g = await req('/api/shoppinglists');
    const rec = JSON.parse(g.body).find(x => x.date === today);
    assert.equal(rec.items.find(i => i.id === 'i1').checked, true, 'item flipped on disk');

    const ups = A.received.map(JSON.parse).filter(m => m.type === 'update' && m.dataset === 'shoppinglists');
    assert.ok(ups.length >= 1, 'A got broadcast after tick');
    const body = JSON.parse(ups[ups.length - 1].body);
    assert.equal(body[0].items.find(i => i.id === 'i1').checked, true, 'broadcast reflects the flip');
    A.close();
});

test('tick rejects unknown item', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await req('/api/shoppinglists/tick', 'POST', JSON.stringify({ date: today, itemId: 'nope', checked: true }));
    assert.equal(r.status, 400, 'unknown item rejected');
});

test('pantry dataset write broadcasts to a subscribed peer', async () => {
    const A = await mkClient();
    A.send(JSON.stringify({ type: 'subscribe', dataset: 'pantry-items' }));
    await sleep(200);

    const seed = JSON.stringify([{ pantryId: 'p1', ingredientFoodId: 'flour', productName: 'Flour 1kg', brand: 'Brand', quantity: 3, isTracked: true }]);
    const put = await req('/api/pantry-items', 'PUT', seed);
    assert.equal(put.status, 200, 'pantry PUT accepted');
    await sleep(400);

    const ups = A.received.map(JSON.parse).filter(m => m.type === 'update' && m.dataset === 'pantry-items');
    assert.ok(ups.length >= 1, 'A received pantry-items broadcast; got: ' + JSON.stringify(A.received));
    const parsed = JSON.parse(ups[ups.length - 1].body);
    assert.equal(parsed[0].pantryId, 'p1', 'broadcast carries the pantry content');
    A.close();
});

test('SyncClient module syncs ticks both ways across two clients', async () => {
    const SyncClient = require('../sync-client.js');
    const today = new Date().toISOString().slice(0, 10);
    await req('/api/shoppinglists', 'PUT', JSON.stringify([{ date: today, items: [
        { id: 'm1', name: 'M1', qty: 1, unit: 'kg', checked: false },
        { id: 'm2', name: 'M2', qty: 1, unit: 'kg', checked: false }
    ] }]));

    const seenA = [];
    const seenB = [];
    let A = null;
    let B = null;
    try {
        A = new SyncClient({ url: 'ws://127.0.0.1:' + PORT + '/ws', onUpdate: (ds, body) => seenA.push(body) });
        B = new SyncClient({ url: 'ws://127.0.0.1:' + PORT + '/ws', onUpdate: (ds, body) => seenB.push(body) });
        A.subscribe('shoppinglists');
        B.subscribe('shoppinglists');
        await sleep(300);

        await req('/api/shoppinglists/tick', 'POST', JSON.stringify({ date: today, itemId: 'm1', checked: true }));
        await sleep(300);
        await req('/api/shoppinglists/tick', 'POST', JSON.stringify({ date: today, itemId: 'm2', checked: true }));
        await sleep(300);

        const dump = (arr) => JSON.stringify(arr.map(recs => recs.map(r => [r.date, r.items.map(i => [i.id, i.checked])])));
        const findChecked = (records, id) => {
            const rec = (records || []).find(r => r.date === today);
            if (!rec) return undefined;
            const it = (rec.items || []).find(i => i.id === id);
            return it && it.checked;
        };
        assert.ok(seenA.length >= 2, 'A received broadcasts: ' + dump(seenA));
        assert.ok(seenB.length >= 2, 'B received broadcasts: ' + dump(seenB));
        assert.equal(findChecked(seenA[seenA.length - 1], 'm1'), true, 'A converged on m1');
        assert.equal(findChecked(seenA[seenA.length - 1], 'm2'), true, 'A converged on m2');
        assert.equal(findChecked(seenB[seenB.length - 1], 'm1'), true, 'B converged on m1');
        assert.equal(findChecked(seenB[seenB.length - 1], 'm2'), true, 'B converged on m2');
    } finally {
        if (A) A.close();
        if (B) B.close();
    }
});
