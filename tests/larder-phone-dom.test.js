// Browser-level phone PWA verification: boots the real phone/index.html +
// modules in jsdom with a fetch stub, and checks the three phone screens behave:
//   1) checklist renders today's list and a checkbox click posts the tick;
//   2) pantry quick-use writes consumption + pantry-items;
//   3) receipt parse + save PUTs the receipts array;
//   4) a SyncClient broadcast repaints the active view (PC↔phone live sync).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TODAY = new Date().toISOString().split('T')[0];

function makeDom() {
    const html = fs.readFileSync(path.join(ROOT, 'phone', 'index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost:8000/phone/', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;

    const calls = { tick: [], receiptsPut: [], consumptionPut: [], pantryPut: [] };
    const datasets = {
        '/api/shoppinglists': [{
            date: TODAY,
            items: [
                { id: 'g1', name: 'Flour', amount: 500, unit: 'g', checked: false },
                { id: 'g2', name: 'Sugar', amount: 250, unit: 'g', checked: false }
            ]
        }],
        '/api/pantry-items': [
            { pantryId: 'pa', ingredientFoodId: 'flour', productName: 'Flour 1kg', brand: 'Brand', packSize: 1000, packUnit: 'g', quantity: 3, isTracked: true }
        ],
        '/api/consumption': [],
        '/api/receipts': [],
        '/api/ingredients': [],
        '/api/settings': { shopping: { currency: 'MUR' } },
        '/api/network-info': { port: 8000, allowLan: true, lanAddresses: ['192.168.1.5'] }
    };

    window.fetch = async (url, opts = {}) => {
        const u = String(url);
        const method = opts.method || 'GET';
        if (method === 'POST' && u.startsWith('/api/shoppinglists/tick')) {
            calls.tick.push(JSON.parse(String(opts.body)));
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (method === 'PUT' && u.startsWith('/api/receipts')) {
            calls.receiptsPut.push(JSON.parse(String(opts.body)));
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (method === 'PUT' && u.startsWith('/api/consumption')) {
            calls.consumptionPut.push(JSON.parse(String(opts.body)));
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (method === 'PUT' && u.startsWith('/api/pantry-items')) {
            calls.pantryPut.push(JSON.parse(String(opts.body)));
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        for (const k of Object.keys(datasets).sort((a, b) => b.length - a.length)) {
            if (u.startsWith(k)) return { ok: true, status: 200, json: async () => datasets[k] };
        }
        return { ok: true, status: 200, json: async () => [] };
    };

    for (const f of ['calc.js', 'sync-client.js', path.join('phone', 'app.js')]) {
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    return { dom, window, calls };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootDom() {
    const ctx = makeDom();
    const { window } = ctx;
    for (let i = 0; i < 60 && window.document.readyState !== 'complete'; i++) await sleep(5);
    await sleep(60);
    return ctx;
}

test("phone checklist renders today's list and a click posts the tick", async () => {
    const { window, calls } = await bootDom();
    try {
        assert.ok(window.PhoneApp, 'PhoneApp exposed');
        const items = window.document.querySelectorAll('#list-items .ph-item');
        assert.equal(items.length, 2, 'two rows rendered');
        const box = window.document.querySelector('#list-items .ph-check[data-idx="0"]');
        assert.ok(box, 'checkbox present');
        assert.equal(box.getAttribute('aria-checked'), 'false');
        box.click();
        await sleep(30);
        assert.equal(calls.tick.length, 1, 'one tick POST issued');
        assert.deepEqual(calls.tick[0], { date: TODAY, itemId: 'g1', checked: true });
        const reRendered = window.document.querySelector('#list-items .ph-check[data-idx="0"]');
        assert.equal(reRendered.getAttribute('aria-checked'), 'true', 'optimistic re-render');
    } finally {
        window.close();
    }
});

test('pantry quick-use writes consumption + decrements pantry-items', async () => {
    const { window, calls } = await bootDom();
    try {
        window.PhoneApp.switchView('pantry');
        await sleep(20);
        assert.ok(window.document.querySelector('#pantry-items .pantry-use'), 'Use button rendered');
        const grams = window.document.querySelector('#pantry-items .pantry-grams');
        grams.value = '1000';
        window.document.querySelector('#pantry-items .pantry-use').click();
        await sleep(40);
        assert.equal(calls.consumptionPut.length, 1, 'consumption written');
        const rec = calls.consumptionPut[0][0];
        assert.equal(rec.source, 'manual', 'manual source');
        assert.equal(rec.items[0].foodId, 'flour');
        assert.equal(rec.items[0].grams, 1000);
        assert.equal(calls.pantryPut.length, 1, 'pantry-items written');
        const pi = calls.pantryPut[0].find(p => p.pantryId === 'pa');
        assert.equal(pi.quantity, 2, 'one 1000 g pack decremented from 3 packs');
    } finally {
        window.close();
    }
});

test('receipt parse + save PUTs the receipts array', async () => {
    const { window, calls } = await bootDom();
    try {
        window.PhoneApp.switchView('receipt');
        const ta = window.document.getElementById('rc-text');
        ta.value = 'Rice 2 kg 145\nTOTAL 145';
        window.document.getElementById('rc-parse').click();
        await sleep(20);
        assert.ok(window.document.querySelectorAll('#rc-items .ph-item').length >= 1, 'parsed rows shown');
        window.document.getElementById('rc-save').click();
        await sleep(40);
        assert.equal(calls.receiptsPut.length, 1, 'receipts saved via PUT');
        const saved = calls.receiptsPut[0];
        assert.ok(saved[0].id.startsWith('rc_'), 'generated id');
        assert.equal(saved[0].store, 'Other');
        assert.ok(saved[0].items.some(i => i.name === 'Rice'), 'parsed item persisted');
        assert.equal(saved[0].currency, 'MUR', 'currency from settings');
    } finally {
        window.close();
    }
});

test('a broadcast repaints the active phone view (PC → phone live sync)', async () => {
    const { window } = await bootDom();
    try {
        assert.ok(window._phoneSync, 'SyncClient instance created');
        assert.ok(window._phoneSync.datasets.has('shoppinglists'), 'subscribed to shoppinglists');

        window._phoneSync.onUpdate('shoppinglists', [{
            date: TODAY,
            items: [
                { id: 'g1', name: 'Flour', amount: 500, unit: 'g', checked: true },
                { id: 'g2', name: 'Sugar', amount: 250, unit: 'g', checked: false }
            ]
        }]);
        await sleep(30);

        const firstRow = window.document.querySelector('#list-items .ph-item[data-idx="0"]');
        assert.ok(firstRow.classList.contains('checked'), 'peer tick visible on the phone');
        const box = firstRow.querySelector('.ph-check');
        assert.equal(box.getAttribute('aria-checked'), 'true', 'checkbox reflects broadcast');
    } finally {
        window.close();
    }
});