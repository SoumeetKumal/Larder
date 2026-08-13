// Browser-level verification of the LAN-sync gate at the real CMS layer.
// Boots the actual cms.html + modules in jsdom, then:
//   1) a shopping checkbox click must POST the per-item tick payload;
//   2) feeding a shopping-lists broadcast into the SyncClient must repaint the
//      rendered shopping list (the "other tab updates live" behaviour);
//   3) a pantry broadcast repaints the pantry tab when it is active.
// Note: tests must window.close() their jsdom or its timers keep the runner open.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TODAY = new Date().toISOString().split('T')[0];

const PANTRY_ITEMS = [
    { pantryId: 'pa', ingredientFoodId: 'flour', productName: 'Flour 1kg', brand: 'Brand', quantity: 3, packUnit: 'pack', price: 60, isTracked: true },
    { pantryId: 'pb', ingredientFoodId: 'flour', productName: 'Flour 500g', brand: 'Brand2', quantity: 5, packUnit: 'pack', price: 35, isTracked: false }
];

function makeDom() {
    const html = fs.readFileSync(path.join(ROOT, 'cms.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost:8000/cms.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    window.lucide = { createIcons: () => {} };
    window.alert = () => {};
    window.confirm = () => true;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    const tickCalls = [];
    window.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        const u = String(url);
        if (method === 'POST' && u.startsWith('/api/shoppinglists/tick')) {
            tickCalls.push(JSON.parse(String(opts.body)));
            return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        const datasets = {
            '/api/recipes': [],
            '/api/ingredients': [
                { foodId: 'flour', name: 'Flour', category: 'Baking', servingSizeG: 100, servingUnit: 'g', calories: 360, proteinG: 10, fatG: 1, carbsG: 76, averagePrice: 40, priceBasisAmount: 1000, priceBasisUnit: 'g' }
            ],
            '/api/mealplans': [],
            '/api/pantry': [],
            '/api/pantry-items': PANTRY_ITEMS,
            '/api/shoppinglists': [{
                date: TODAY,
                items: [
                    { id: 'g1', name: 'Flour', amount: 500, unit: 'g', checked: false },
                    { id: 'g2', name: 'Sugar', amount: 250, unit: 'g', checked: false }
                ]
            }],
            '/api/household': [],
            '/api/planner': { goals: {}, items: [] },
            '/api/receipts': [],
            '/api/settings': { profiles: [], shopping: { currency: 'MUR' }, preferences: {}, automation: {} },
            '/api/exercises': [],
            '/api/workout-templates': [],
            '/api/product-prefs': [],
            '/api/planner-templates': [],
            '/api/plan-versions': []
        };
        for (const k of Object.keys(datasets).sort((a, b) => b.length - a.length)) {
            if (u.startsWith(k)) return { ok: true, status: 200, json: async () => datasets[k] };
        }
        return { ok: true, status: 200, json: async () => [] };
    };

    for (const f of ['calc.js', 'cms-utils.js', 'cms-state.js', 'cms-receipts.js', 'cms-planner.js', 'sync-client.js', 'cms.js']) {
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    return { dom, window, tickCalls };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bootTab(tabName) {
    const ctx = makeDom();
    const { window } = ctx;
    for (let i = 0; i < 60 && window.document.readyState !== 'complete'; i++) await sleep(5);
    await sleep(50);
    const tab = window.document.querySelector('.cms-tab[data-tab="' + tabName + '"]');
    assert.ok(tab, tabName + ' tab exists');
    tab.click();
    await sleep(30);
    return ctx;
}

test('shopping checkbox click posts a per-item tick payload', async () => {
    const { window, tickCalls } = await bootTab('shopping');
    try {
        assert.ok(window.document.querySelector('.vd-shop-item'), 'shopping list rendered rows');
        const firstBox = window.document.querySelector('.vd-shop-item .vd-shop-checkbox');
        assert.ok(firstBox, 'checkbox element present');
        firstBox.click();
        await sleep(20);
        assert.equal(tickCalls.length, 1, 'exactly one tick POST issued');
        assert.deepEqual(tickCalls[0], { date: TODAY, itemId: 'g1', checked: true });
    } finally {
        window.close();
    }
});

test('server broadcast repaints the rendered list (other-tab behaviour)', async () => {
    const { window } = await bootTab('shopping');
    try {
        const row = window.document.querySelector('.vd-shop-item');
        assert.ok(row && !row.classList.contains('checked'), 'starts unchecked');

        assert.ok(window.larderSync, 'SyncClient instance is exposed');
        window.larderSync.onUpdate('shoppinglists', [{
            date: TODAY,
            items: [
                { id: 'g1', name: 'Flour', amount: 500, unit: 'g', checked: true },
                { id: 'g2', name: 'Sugar', amount: 250, unit: 'g', checked: false }
            ]
        }]);
        await sleep(30);

        const rows = window.document.querySelectorAll('.vd-shop-item');
        assert.equal(rows.length, 2, 'list re-rendered with same two items');
        const g1 = rows[0];
        assert.ok(g1.classList.contains('checked'), 'peer sees the ticked item as checked');
        const box = g1.querySelector('.vd-shop-checkbox');
        assert.equal(box.getAttribute('aria-checked'), 'true', 'aria reflects the new state');
    } finally {
        window.close();
    }
});

test('pantry broadcast repaints the pantry tab when active', async () => {
    const { window } = await bootTab('pantry');
    try {
        assert.ok(window.document.querySelectorAll('.vd-pantry-card').length >= 1, 'pantry rendered at least one card');
        assert.ok(window.larderSync, 'SyncClient exposed');
        for (const ds of ['shoppinglists', 'pantry', 'pantry-items']) {
            assert.ok(window.larderSync.datasets.has(ds), 'subscribed to ' + ds);
        }

        window.larderSync.onUpdate('pantry-items', [
            { pantryId: 'pa', ingredientFoodId: 'flour', productName: 'Flour 1kg', brand: 'Brand', quantity: 4, packUnit: 'pack', price: 60, isTracked: true },
            { pantryId: 'pb', ingredientFoodId: 'flour', productName: 'Flour 500g', brand: 'Brand2', quantity: 5, packUnit: 'pack', price: 35, isTracked: false },
            { pantryId: 'pc', ingredientFoodId: 'flour', productName: 'Sugar 1kg', brand: 'SweetCo', quantity: 2, packUnit: 'pack', price: 90, isTracked: false }
        ]);
        await sleep(30);

        const cards = window.document.querySelectorAll('.vd-pantry-card');
        assert.equal(cards.length, 3, 'pantry re-rendered with the broadcast items');
        assert.ok(cards[2].textContent.includes('Sugar 1kg'), 'broadcast item appears in the DOM');
    } finally {
        window.close();
    }
});