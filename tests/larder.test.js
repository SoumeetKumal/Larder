// Larder integration test harness.
// Usage:  node tests/larder.test.js
// Starts the real server on a temp data dir (port 8000 must be free),
// then exercises the API + static syntax checks and integrity rules.
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server.js');
const HOST = '127.0.0.1';
const PORT = 8000;
const AUTH = 'Bearer larder_local_sync_8f92k';

let passed = 0, failed = 0;
function ok(cond, label) {
    if (cond) { passed++; console.log('  \u2713 ' + label); }
    else { failed++; console.log('  \u2717 ' + label); }
}
// In-process request via the built-in http module with `agent: false` so every
// request opens+closes its own socket and no keep-alive handle lingers at exit
// (avoids a known undici/libuv teardown abort on Windows when using fetch()).
function req(p, opts = {}) {
    return new Promise((resolve) => {
        const body = opts.body ? Buffer.from(String(opts.body)) : null;
        const headers = Object.assign({
            'Authorization': AUTH,
            'Content-Type': 'application/json',
            'Connection': 'close',
            'Content-Length': body ? body.length : 0
        }, opts.headers || {});
        const r = http.request({
            host: HOST, port: PORT, path: p, method: opts.method || 'GET', headers, agent: false
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let body = null;
                try { body = JSON.parse(data); } catch (e) { /* non-JSON */ }
                resolve({ status: res.statusCode, body });
            });
        });
        r.on('error', () => resolve({ status: 0, body: null }));
        if (body) r.write(body);
        r.end();
    });
}

async function main() {
    // --- Static syntax checks ---
    console.log('[static]');
    for (const f of ['cms.js', 'server.js']) {
        const r = spawnSync(process.execPath, ['-c', f], { cwd: ROOT, encoding: 'utf8' });
        ok(r.status === 0, `${f} parses (node -c)`);
    }
    for (const f of ['recipes.json', 'ingredients.json', 'mealplans.json', 'pantry.json', 'settings.json', 'household.json', 'shoppinglists.json']) {
        try { JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); ok(true, `data/${f} is valid JSON`); }
        catch (e) { ok(false, `data/${f} is valid JSON (${e.message})`); }
    }

    // --- Boot real server on a temp data dir ---
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'larder-test-'));
    for (const f of ['recipes.json', 'ingredients.json', 'mealplans.json', 'pantry.json', 'household.json', 'shoppinglists.json', 'settings.json', 'receipts.json']) {
        const src = path.join(ROOT, 'data', f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmp, f));
    }
    console.log('[server]');
    const child = spawn(process.execPath, [SERVER], {
        cwd: ROOT,
        env: { ...process.env, LARDER_DATA_DIR: tmp, LARDER_IS_ELECTRON: '1' },
        stdio: 'ignore'
    });
    // Wait for readiness (poll up to ~10s)
    let ready = false;
    for (let i = 0; i < 40; i++) {
        try {
const r = await req('/api/settings');
        if (r.status === 200) { ready = true; break; }
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 250));
    }
    if (!ready) {
        console.log('  \u2717 server did not become ready (is port 8000 free?)');
        child.kill(); process.exit(1);
    }
    ok(true, 'server booted on temp data dir');

    // --- Auth gate ---
    console.log('[auth]');
    {
        const r = await req('/api/ingredients', { headers: { 'Authorization': '' } });
        ok(r.status === 401, 'request without API key is rejected (401)');
    }

    // --- Core CRUD + integrity ---
    console.log('[api]');
    const ing = await req('/api/ingredients');
    ok(ing.status === 200 && Array.isArray(ing.body) && ing.body.length > 0, 'GET /api/ingredients returns array');
    const ids = new Set((ing.body || []).map(i => i.foodId));

    const pantry = await req('/api/pantry');
    ok(Array.isArray(pantry.body), 'GET /api/pantry returns array');
    ok((pantry.body || []).every(p => ids.has(p.foodId)), 'every pantry foodId exists in ingredients');

    const planner = await req('/api/planner');
    ok(planner.status === 200 && planner.body && Array.isArray(planner.body.items), 'GET /api/planner returns {goals, items}');
    {
        const put = await req('/api/planner', {
            method: 'PUT',
            body: JSON.stringify({ goals: { proteinMin: 300, budget: 6000, currency: 'MUR' }, items: [] })
        });
        ok(put.status === 200, 'PUT /api/planner accepts an object');
        const bad = await req('/api/planner', { method: 'PUT', body: '[]' });
        ok(bad.status === 400, 'PUT /api/planner rejects an array (400)');
    }
    {
        const put = await req('/api/receipts', {
            method: 'PUT',
            body: JSON.stringify([{ id: 'rc_test', store: 'X', date: '2026-08-06', total: 10, currency: 'MUR', items: [{ name: 'Tagliatelle', price: 10 }] }])
        });
        ok(put.status === 200, 'PUT /api/receipts accepts an array');
    }
    const settings = await req('/api/settings');
    ok(settings.body && Array.isArray(settings.body.profiles), 'settings exposes profiles array');

    // --- Write validation ---
    console.log('[validation]');
    {
        const bad = await req('/api/ingredients', { method: 'PUT', body: JSON.stringify([{ name: 'No foodId' }]) });
        ok(bad.status === 400, 'ingredients record without foodId rejected (400)');
        const okEmpty = await req('/api/pantry', { method: 'PUT', body: '[]' });
        ok(okEmpty.status === 200, 'empty pantry array accepted');
    }
    {
        const badItem = await req('/api/planner', { method: 'PUT', body: JSON.stringify({ goals: {}, items: [{ name: 'x' }] }) });
        ok(badItem.status === 400, 'planner item without ingredientId rejected');
        const badGoals = await req('/api/planner', { method: 'PUT', body: JSON.stringify({ goals: [], items: [] }) });
        ok(badGoals.status === 400, 'planner goals as array rejected');
    }
    {
        const badRc = await req('/api/receipts', { method: 'PUT', body: JSON.stringify([{ id: 'x', items: [{ price: 5 }] }]) });
        ok(badRc.status === 400, 'receipt item without name rejected');
    }
    {
        const badSet = await req('/api/settings', { method: 'PUT', body: JSON.stringify({ profiles: 'nope' }) });
        ok(badSet.status === 400, 'settings.profiles not an array rejected');
    }

    // --- Consumption API ---
    console.log('[consumption]');
    {
        const cons = await req('/api/consumption');
        ok(cons.status === 200 && Array.isArray(cons.body), 'GET /api/consumption returns array');
    }
    {
        const put = await req('/api/consumption', {
            method: 'PUT',
            body: JSON.stringify([{ id: 'cons_test', date: '2026-08-12', recipeId: '1', recipeTitle: 'Test', servingsCooked: 2, items: [{ foodId: 'tagliatelle', grams: 300 }] }])
        });
        ok(put.status === 200, 'PUT /api/consumption accepts an array');
        const get = await req('/api/consumption');
        ok(get.body.some(c => c.id === 'cons_test'), 'consumption record persisted');
    }
    {
        const bad = await req('/api/consumption', { method: 'PUT', body: 'not an array' });
        ok(bad.status === 400, 'PUT /api/consumption rejects non-array');
    }
    // Verify manual consumption records work
    {
        const put = await req('/api/consumption', {
            method: 'PUT',
            body: JSON.stringify([{ id: 'cons_manual_test', date: '2026-08-12', recipeId: null, recipeTitle: 'Manual use: Salt', servingsCooked: null, source: 'manual', items: [{ foodId: 'salt', grams: 10 }] }])
        });
        ok(put.status === 200, 'PUT /api/consumption accepts manual source');
        const get = await req('/api/consumption');
        const manual = get.body.find(c => c.source === 'manual');
        ok(manual, 'manual source consumption record exists');
        ok(manual.items && manual.items.length > 0, 'manual record has items');
        ok(manual.recipeId === null, 'manual record has null recipeId');
    }

    // --- Shopping List History ---
    console.log('[shopping list history]');
    {
        const today = new Date().toISOString().split('T')[0];
        const put = await req('/api/shoppinglists', {
            method: 'PUT',
            body: JSON.stringify([{ id: 'sl_test', date: today, items: [{ foodId: 'tagliatelle', name: 'Tagliatelle', amount: 500, unit: 'g', checked: false }] }])
        });
        ok(put.status === 200, 'PUT /api/shoppinglists accepts dated records');
        const get = await req('/api/shoppinglists');
        ok(get.body.some(r => r.id === 'sl_test'), 'shopping list record persisted');
        ok(get.body[0].items && get.body[0].items[0].foodId === 'tagliatelle', 'items array in record');
    }
    {
        const bad = await req('/api/shoppinglists', { method: 'PUT', body: 'not an array' });
        ok(bad.status === 400, 'PUT /api/shoppinglists rejects non-array');
    }

    // --- Product prefs (brand memory) API ---
    console.log('[product prefs]');
    {
        const get = await req('/api/product-prefs');
        ok(get.status === 200 && Array.isArray(get.body), 'GET /api/product-prefs returns array');
    }
    {
        const put = await req('/api/product-prefs', {
            method: 'PUT',
            body: JSON.stringify([{ foodId: 'tagliatelle', pantryId: 'p_granoro', updatedAt: '2026-08-13T00:00:00.000Z' }])
        });
        ok(put.status === 200, 'PUT /api/product-prefs accepts an array');
        const get = await req('/api/product-prefs');
        ok(get.body.some(x => x.foodId === 'tagliatelle' && x.pantryId === 'p_granoro'), 'product pref persisted');
    }
    {
        const bad = await req('/api/product-prefs', { method: 'PUT', body: JSON.stringify([{ pantryId: 'p_x' }]) });
        ok(bad.status === 400, 'PUT /api/product-prefs rejects record without foodId');
        const bad2 = await req('/api/product-prefs', { method: 'PUT', body: 'not an array' });
        ok(bad2.status === 400, 'PUT /api/product-prefs rejects non-array');
    }

    // --- Planner templates & plan versions API ---
    console.log('[planner templates & versions]');
    {
        const get = await req('/api/planner-templates');
        ok(get.status === 200 && Array.isArray(get.body), 'GET /api/planner-templates returns array');
    }
    {
        const put = await req('/api/planner-templates', {
            method: 'PUT',
            body: JSON.stringify([{ id: 'tpl_test', name: 'August week template', savedOn: '2026-08-13T09:00:00.000Z', eaters: [{ idx: 0, eatingOut: false, items: [{ type: 'recipe', referenceId: 'r1', name: 'Tuna pasta', grams: 250 }] }] }])
        });
        ok(put.status === 200, 'PUT /api/planner-templates accepts an array');
        const get = await req('/api/planner-templates');
        ok(get.body.some(t => t.id === 'tpl_test'), 'planner template persisted');
    }
    {
        const bad = await req('/api/planner-templates', { method: 'PUT', body: JSON.stringify([{ eaters: [] }]) });
        ok(bad.status === 400, 'PUT /api/planner-templates rejects record without name');
    }
    {
        const put = await req('/api/plan-versions', {
            method: 'PUT',
            body: JSON.stringify([{ id: 'pv_test', confirmedAt: '2026-08-13T09:05:00.000Z', itemCount: 7, plannedMealCount: 3, slotCount: 28, plans: [] }])
        });
        ok(put.status === 200, 'PUT /api/plan-versions accepts an array');
        const get = await req('/api/plan-versions');
        ok(get.body.some(v => v.id === 'pv_test'), 'plan version persisted');
    }
    {
        const bad = await req('/api/plan-versions', { method: 'PUT', body: JSON.stringify([{ itemCount: 1 }]) });
        ok(bad.status === 400, 'PUT /api/plan-versions rejects record without id');
    }

    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
