// Larder phone PWA client. Mobile-first screens over the same /api/* + /ws the
// CMS uses: shared live checklist, pantry quick-use, receipt capture (pasted-text
// primary; native OCR when hosted by the desktop app). No framework, no build.
(function () {
    'use strict';

    const API_KEY = 'larder_local_sync_8f92k';
    const HEADERS = {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json'
    };

    const $ = (id) => document.getElementById(id);
    const todayUTC = () => new Date().toISOString().split('T')[0];

    const state = {
        shoppinglists: [],
        pantryItems: [],
        consumption: [],
        receipts: [],
        ingredients: [],
        settings: { shopping: { currency: 'MUR' } },
        listDate: todayUTC(),
        live: false
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function api(pathname, method = 'GET', body = null) {
        const opts = { method, headers: HEADERS };
        if (body != null) opts.body = JSON.stringify(body);
        const res = await fetch(pathname, opts);
        if (!res.ok) throw new Error(pathname + ' -> ' + res.status);
        return res.json();
    }

    function setStatus(cls, text) {
        const el = $('ph-status');
        if (!el) return;
        el.className = 'ph-status' + (cls ? ' ' + cls : '');
        el.textContent = text;
    }

    function note(text, ok = true) {
        const el = $('rc-note');
        if (!el) return;
        el.className = 'ph-note ' + (ok ? 'ok' : 'err');
        el.textContent = text;
    }

    function switchView(name) {
        document.querySelectorAll('.ph-view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
        document.querySelectorAll('.ph-tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
        if (name === 'list') renderList();
        if (name === 'pantry') renderPantry();
    }

    // --- Shopping checklist ---
    function renderList() {
        const itemsEl = $('list-items');
        const emptyEl = $('list-empty');
        const dateEl = $('list-date');
        const countEl = $('list-count');
        const rec = (state.shoppinglists || []).find(r => r.date === state.listDate);
        const items = rec ? (rec.items || []) : [];
        if (!rec || !items.length) {
            itemsEl.innerHTML = '';
            emptyEl.hidden = false;
            dateEl.textContent = 'Shopping list';
            countEl.textContent = state.listDate;
            return;
        }
        emptyEl.hidden = true;
        dateEl.textContent = state.listDate;
        const done = items.filter(i => i.checked).length;
        countEl.textContent = done + ' / ' + items.length + ' done';
        itemsEl.innerHTML = items.map((it, idx) => {
            const amount = it.amount != null ? esc(String(it.amount)) + ' ' + esc(it.unit || '') : '';
            return `<li class="ph-item${it.checked ? ' checked' : ''}" data-idx="${idx}">
                <button class="ph-check" role="checkbox" aria-checked="${it.checked ? 'true' : 'false'}" data-idx="${idx}">${it.checked ? '&#10003;' : ''}</button>
                <div class="ph-item-body">
                    <div class="ph-item-name">${esc(it.name || it.foodId || 'Item')}</div>
                    ${amount ? `<div class="ph-item-sub">${amount}</div>` : ''}
                </div>
            </li>`;
        }).join('');
        itemsEl.querySelectorAll('.ph-check').forEach(box => {
            box.addEventListener('click', async () => {
                const idx = parseInt(box.dataset.idx, 10);
                const item = items[idx];
                if (!item || !item.id) return;
                const next = !item.checked;
                item.checked = next;
                renderList();
                try {
                    await api('/api/shoppinglists/tick', 'POST', { date: state.listDate, itemId: item.id, checked: next });
                } catch (e) {
                    item.checked = !next;
                    renderList();
                }
            });
        });
    }

    // --- Pantry quick-use (same shared /api/consumption + /api/pantry-items writes
    // the CMS "Used" control performs, so the phone stays in the loop) ---
    function renderPantry() {
        const itemsEl = $('pantry-items');
        const emptyEl = $('pantry-empty');
        const tracked = (state.pantryItems || []).filter(p => p.isTracked);
        if (!tracked.length) {
            itemsEl.innerHTML = '';
            emptyEl.hidden = false;
            return;
        }
        emptyEl.hidden = true;
        itemsEl.innerHTML = tracked.map((p, idx) => {
            const qty = parseFloat(p.quantity) || 0;
            const packSize = parseFloat(p.packSize) || 100;
            const grams = Math.round(qty * packSize);
            const name = (p.brand ? p.brand + ' ' : '') + p.productName;
            return `<li class="ph-item" data-idx="${idx}">
                <div class="ph-item-body">
                    <div class="ph-item-name">${esc(name)}</div>
                    <div class="ph-item-sub">${qty} × ${packSize}${esc(p.packUnit || 'g')} = ${grams} g</div>
                </div>
                <input class="ph-input pantry-grams" type="number" min="1" placeholder="g" style="width: 84px;">
                <button class="ph-tap pantry-use" data-idx="${idx}" type="button">Use</button>
            </li>`;
        }).join('');
        itemsEl.querySelectorAll('.pantry-use').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const p = tracked[idx];
                if (!p) return;
                const input = btn.parentElement.querySelector('.pantry-grams');
                const grams = parseFloat(input && input.value) || (parseFloat(p.packSize) || 100);
                await usePantry(p, grams);
            });
        });
    }

    async function usePantry(p, grams) {
        try {
            const today = todayUTC();
            const record = {
                id: 'cons_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                date: today,
                recipeId: null,
                recipeTitle: 'Manual use: ' + ((p.brand ? p.brand + ' ' : '') + p.productName),
                servingsCooked: null,
                source: 'manual',
                items: [{ foodId: p.ingredientFoodId, grams: Math.round(grams * 10) / 10 }]
            };
            const consumption = Array.isArray(state.consumption) ? state.consumption.slice() : [];
            consumption.unshift(record);
            state.consumption = consumption;
            await api('/api/consumption', 'PUT', consumption);

            const packSize = parseFloat(p.packSize) || 100;
            p.quantity = Math.max(0, Math.round(((parseFloat(p.quantity) || 0) - grams / packSize) * 100) / 100);
            p.lastOpenedDate = today;
            await api('/api/pantry-items', 'PUT', state.pantryItems);
            renderPantry();
            setStatus('live', 'used ' + grams + ' g');
        } catch (e) {
            setStatus('off', 'use failed');
        }
    }

    // --- Receipt capture: paste text primary, native OCR when desktop-hosted ---
    function renderParsed(parsed) {
        const itemsEl = $('rc-items');
        if (!parsed.length) {
            itemsEl.innerHTML = '';
            note('Could not parse any lines.', false);
            return;
        }
        itemsEl.innerHTML = parsed.map(l => `<li class="ph-item">
            <div class="ph-item-body">
                <div class="ph-item-name">${esc(l.name)}</div>
                <div class="ph-item-sub">${l.qty} \u00d7 ${esc(l.unit || 'g')} \u2014 ${l.price}</div>
            </div>
        </li>`).join('');
        const totalInput = $('rc-total') || null;
        if (totalInput && !(parseFloat(totalInput.value) > 0)) {
            const sum = parsed.reduce((s, l) => s + (l.price || 0) * (l.qty || 1), 0);
            totalInput.value = Math.round(sum * 100) / 100;
        }
        note(parsed.length + ' line(s) parsed.', true);
    }

    function saveReceipt() {
        return (async () => {
            const text = ($('rc-text') || {}).value || '';
            if (!text.trim()) { note('Paste receipt text first.', false); return; }
            const parsed = (window.LarderCalc && window.LarderCalc.parseReceiptText) ? window.LarderCalc.parseReceiptText(text, state.ingredients) : [];
            if (!parsed.length) { note('Could not parse any lines.', false); return; }
            const store = ($('rc-store') || {}).value || 'Other';
            const date = ($('rc-date') || {}).value || todayUTC();
            const enteredTotal = parseFloat(($('rc-total') || {}).value) || 0;
            const items = parsed.map(l => ({ name: l.name, qty: l.qty, unit: l.unit || 'g', price: l.price || 0, foodId: l.foodId || null, matchedName: l.matchedName || null }));
            const computed = items.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
            const receipt = {
                id: 'rc_' + Date.now(),
                store,
                date,
                total: enteredTotal || Math.round(computed * 100) / 100,
                currency: (state.settings.shopping && state.settings.shopping.currency) || 'MUR',
                items,
                enteredTotal
            };
            const receipts = Array.isArray(state.receipts) ? state.receipts.slice() : [];
            receipts.unshift(receipt);
            state.receipts = receipts;
            await api('/api/receipts', 'PUT', receipts);
            note('Receipt saved (' + items.length + ' item(s)).', true);
            renderParsed(parsed);
        })().catch((e) => note('Save failed: ' + e.message, false));
    }

    // --- Live sync over the shared /ws hub (shopping lists + pantry, so a tick on
    // the PC repaints the phone instantly and vice versa) ---
    function connectSync() {
        if (typeof window.SyncClient === 'undefined') return;
        const client = new window.SyncClient({
            onUpdate: (dataset, body) => {
                if (dataset === 'shoppinglists') state.shoppinglists = body;
                if (dataset === 'pantry-items') state.pantryItems = body;
                if (dataset === 'consumption') state.consumption = body;
                if (dataset === 'receipts') state.receipts = body;
                state.live = true;
                setStatus('live', 'live');
                const active = document.querySelector('.ph-tab.active');
                if (active) switchView(active.dataset.view);
            }
        });
        client.subscribe('shoppinglists');
        client.subscribe('pantry-items');
        client.subscribe('consumption');
        client.subscribe('receipts');
        window._phoneSync = client;
    }

    async function loadAll() {
        try {
            const [lists, pantry, consumption, receipts, ingredients, settings, network] = await Promise.all([
                api('/api/shoppinglists').catch(() => []),
                api('/api/pantry-items').catch(() => []),
                api('/api/consumption').catch(() => []),
                api('/api/receipts').catch(() => []),
                api('/api/ingredients').catch(() => []),
                api('/api/settings').catch(() => ({ shopping: { currency: 'MUR' } })),
                api('/api/network-info').catch(() => null)
            ]);
            state.shoppinglists = lists;
            state.pantryItems = pantry;
            state.consumption = consumption;
            state.receipts = receipts;
            state.ingredients = ingredients;
            state.settings = settings;
            const sortByDate = (a, b) => String(b.date).localeCompare(String(a.date));
            const rec = (lists || []).slice().sort(sortByDate)[0];
            if (rec && rec.date) state.listDate = rec.date;
            setStatus(network && network.allowLan ? 'live' : '', network ? (network.allowLan ? 'live' : 'local') : 'online');
        } catch (e) {
            setStatus('off', 'offline');
        }
        const active = document.querySelector('.ph-tab.active');
        if (active) switchView(active.dataset.view);
    }

    function boot() {
        const dateInput = $('rc-date');
        if (dateInput) dateInput.value = todayUTC();

        document.querySelectorAll('.ph-tab').forEach(tab => {
            tab.addEventListener('click', () => switchView(tab.dataset.view));
        });
        const refresh = $('pantry-refresh');
        if (refresh) refresh.addEventListener('click', () => { loadAll(); });

        const camera = $('rc-camera');
        const preview = $('rc-preview');
        if (camera) {
            camera.addEventListener('change', () => {
                const file = camera.files && camera.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                    if (preview) {
                        preview.src = reader.result;
                        preview.hidden = false;
                    }
                    if (window.larderWindow && window.larderWindow.ocrImage) {
                        try {
                            const hint = $('rc-scan-hint');
                            if (hint) hint.textContent = 'Recognising text…';
                            const res = await window.larderWindow.ocrImage(reader.result);
                            if (res && res.ok && res.lines) {
                                const ta = $('rc-text');
                                const prev = (ta && ta.value.trim()) || '';
                                ta.value = prev ? prev + '\n' + res.lines.join('\n') : res.lines.join('\n');
                                if (hint) hint.textContent = res.lines.length + ' line(s) recognised — review, then Save receipt.';
                            } else if (hint) {
                                hint.textContent = 'Recognition failed — paste the text instead.';
                            }
                        } catch (e) {
                            const hint = $('rc-scan-hint');
                            if (hint) hint.textContent = 'Recognition failed — paste the text instead.';
                        }
                    }
                };
                reader.readAsDataURL(file);
            });
        }

        const parseBtn = $('rc-parse');
        if (parseBtn) parseBtn.addEventListener('click', () => {
            const text = ($('rc-text') || {}).value || '';
            if (!text.trim()) { note('Paste receipt text first.', false); return; }
            const parsed = (window.LarderCalc && window.LarderCalc.parseReceiptText) ? window.LarderCalc.parseReceiptText(text, state.ingredients) : [];
            renderParsed(parsed);
        });

        const saveBtn = $('rc-save');
        if (saveBtn) saveBtn.addEventListener('click', saveReceipt);

        if ('serviceWorker' in navigator) {
            try { navigator.serviceWorker.register('sw.js'); } catch (e) { /* not supported */ }
        }

        loadAll();
        setTimeout(connectSync, 0);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.PhoneApp = { boot, loadAll, renderList, renderPantry, switchView, state, todayUTC };
})();