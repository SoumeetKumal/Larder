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

    // Price helpers (mirrors CMS cms.js perGramPrice / backfillListCosts logic)
    function getPriceBasisGrams(ing) {
        if (!ing) return 100;
        const basisAmount = parseFloat(ing.priceBasisAmount);
        const basisUnit = (ing.priceBasisUnit || '').toLowerCase();
        if (basisAmount > 0 && basisUnit) {
            const mult = { g: 1, gram: 1, kg: 1000, kgs: 1000, ml: 1, l: 1000, litre: 1000, pc: 1, each: 1, bottle: 1, bag: 1, pack: 1, packet: 1, can: 1, tin: 1 }[basisUnit];
            if (mult) return basisAmount * mult;
        }
        return parseFloat(ing.servingSizeG) || 100;
    }
    function perGramPrice(foodId) {
        const ing = state.ingredients.find(i => i.foodId === foodId);
        if (!ing || !parseFloat(ing.averagePrice)) return 0;
        const basis = getPriceBasisGrams(ing);
        return parseFloat(ing.averagePrice) / basis;
    }
    function itemCost(it) {
        if (!it.foodId) return 0;
        const pg = perGramPrice(it.foodId);
        if (!pg) return 0;
        const grams = (parseFloat(it.grams) || 0) || (parseFloat(it.amount) || 0) * 100;
        return pg * grams;
    }
    function updateExpectedTotal() {
        const rec = (state.shoppinglists || []).find(r => r.date === state.listDate);
        if (!rec) return 0;
        const items = rec.items || [];
        return items.filter(i => i.included !== false && !i.checked).reduce((s, it) => s + itemCost(it), 0);
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
        const totalEl = $('list-total'); // may not exist in HTML, that's fine
        const rec = (state.shoppinglists || []).find(r => r.date === state.listDate);
        const items = rec ? (rec.items || []) : [];
        if (!rec || !items.length) {
            itemsEl.innerHTML = '';
            emptyEl.hidden = false;
            dateEl.textContent = 'Shopping list';
            countEl.textContent = state.listDate;
            if (totalEl) totalEl.textContent = '';
            return;
        }
        emptyEl.hidden = true;
        dateEl.textContent = state.listDate;
        const done = items.filter(i => i.checked).length;
        countEl.textContent = done + ' / ' + items.length + ' done';
        const estTotal = updateExpectedTotal();
        if (totalEl) totalEl.textContent = estTotal > 0 ? 'Est. ' + estTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'No prices';
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
            const packSize = parseFloat(p.packSize) || 100;
            const availableGrams = Math.round(((parseFloat(p.quantity) || 0) * packSize) * 10) / 10;
            // Cap to available stock
            grams = Math.min(grams, availableGrams);
            if (grams <= 0) {
                setStatus('off', 'no stock available');
                return;
            }
            // Confirm before decrementing
            const name = (p.brand ? p.brand + ' ' : '') + p.productName;
            if (!confirm(`Use ${grams} g of ${name}?\nAvailable: ${availableGrams} g`)) return;

            const record = {
                id: 'cons_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                date: today,
                recipeId: null,
                recipeTitle: 'Manual use: ' + name,
                servingsCooked: null,
                source: 'manual',
                items: [{ foodId: p.ingredientFoodId, grams: Math.round(grams * 10) / 10 }]
            };
            const consumption = Array.isArray(state.consumption) ? state.consumption.slice() : [];
            consumption.unshift(record);
            state.consumption = consumption;
            await api('/api/consumption', 'PUT', consumption);

            p.quantity = Math.max(0, Math.round(((parseFloat(p.quantity) || 0) - grams / packSize) * 100) / 100);
            p.lastOpenedDate = today;
            await api('/api/pantry-items', 'PUT', state.pantryItems);
            renderPantry();
            setStatus('live', 'used ' + grams + ' g');
            learnDurationFromConsumption(p.ingredientFoodId);
        } catch (e) {
            setStatus('off', 'use failed');
        }
    }

    // Port of cms.js learnDurationFromConsumption: recompute avgDurationDays from
    // consumption events (3+ events required) and persist the update.
    async function learnDurationFromConsumption(foodId) {
        try {
            const consumption = Array.isArray(state.consumption) ? state.consumption : [];
            const events = consumption
                .filter(c => c.items && c.items.some(i => i.foodId === foodId))
                .map(c => ({ date: c.date }))
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            if (events.length >= 3) {
                const avgDays = (window.LarderCalc && window.LarderCalc.rollingAvgDuration) ? window.LarderCalc.rollingAvgDuration(events) : null;
                if (avgDays && avgDays > 0) {
                    let changed = false;
                    state.pantryItems.forEach(p2 => {
                        if (p2.ingredientFoodId === foodId && p2.avgDurationDays !== avgDays) {
                            p2.avgDurationDays = avgDays;
                            changed = true;
                        }
                    });
                    if (changed) {
                        await api('/api/pantry-items', 'PUT', state.pantryItems);
                        renderPantry();
                    }
                }
            }
        } catch (e) {
            console.warn('[Duration learning] failed:', e);
        }
    }

    // --- Receipt capture: paste text primary, native OCR when desktop-hosted ---
    let parsedRows = []; // editable rows after parse

    function renderParsed(parsed) {
        const itemsEl = $('rc-items');
        if (!parsed.length) {
            itemsEl.innerHTML = '';
            note('Could not parse any lines.', false);
            return;
        }
        parsedRows = parsed.map(l => ({
            name: l.name,
            qty: l.qty || 1,
            unit: l.unit || 'g',
            price: l.price || 0,
            foodId: l.foodId || null,
            grams: l.grams || null,
            matchedName: l.matchedName || null,
            category: l.category || null
        }));
        renderItemRows();
        const totalInput = $('rc-total') || null;
        if (totalInput && !(parseFloat(totalInput.value) > 0)) {
            const sum = parsedRows.reduce((s, r) => s + (r.price || 0) * (r.qty || 1), 0);
            totalInput.value = Math.round(sum * 100) / 100;
        }
        note(parsedRows.length + ' line(s) parsed — review, then Save receipt.', true);
    }

    function renderItemRows() {
        const itemsEl = $('rc-items');
        itemsEl.innerHTML = parsedRows.map((r, idx) => `
            <li class="ph-item rc-man-item" data-idx="${idx}">
                <input class="ph-input rc-man-name" type="text" data-idx="${idx}" value="${esc(r.name)}" placeholder="Item name">
                <input class="ph-input rc-man-qty" type="number" step="any" data-idx="${idx}" value="${esc(r.qty)}" style="width:60px;">
                <input class="ph-input rc-man-unit" type="text" data-idx="${idx}" value="${esc(r.unit)}" style="width:46px;">
                <input class="ph-input rc-man-price" type="number" step="0.01" data-idx="${idx}" value="${esc(r.price)}" style="width:90px;">
                <button class="ph-tap rc-rm" data-idx="${idx}" type="button" title="Remove">&times;</button>
            </li>`).join('');
        itemsEl.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('input', () => {
                const i2 = parseInt(inp.dataset.idx, 10);
                if (!parsedRows[i2]) return;
                if (inp.classList.contains('rc-man-name')) parsedRows[i2].name = inp.value;
                else if (inp.classList.contains('rc-man-qty')) parsedRows[i2].qty = parseFloat(inp.value) || 0;
                else if (inp.classList.contains('rc-man-unit')) parsedRows[i2].unit = inp.value;
                else if (inp.classList.contains('rc-man-price')) parsedRows[i2].price = parseFloat(inp.value) || 0;
                updateCalcTotal();
            });
        });
        itemsEl.querySelectorAll('.rc-rm').forEach(btn => {
            btn.addEventListener('click', () => {
                parsedRows.splice(parseInt(btn.dataset.idx, 10), 1);
                renderItemRows();
                updateCalcTotal();
            });
        });
    }

    function updateCalcTotal() {
        const sum = parsedRows.reduce((s, r) => s + (r.price || 0) * (r.qty || 1), 0);
        const totalInput = $('rc-total');
        if (totalInput) totalInput.value = Math.round(sum * 100) / 100;
    }

    function saveReceipt() {
        return (async () => {
            const text = ($('rc-text') || {}).value || '';
            if (!text.trim()) { note('Paste receipt text first.', false); return; }
            const parsed = (window.LarderCalc && window.LarderCalc.parseReceiptText) ? window.LarderCalc.parseReceiptText(text, state.ingredients) : [];
            if (!parsed.length) { note('Could not parse any lines.', false); return; }
            renderParsed(parsed);
            await showPriceComparisonAndSave(parsed);
        })().catch((e) => note('Save failed: ' + e.message, false));
    }

    async function showPriceComparisonAndSave(parsed) {
        // Build final items from edited rows
        const items = parsedRows.map(r => ({
            name: r.name,
            qty: r.qty,
            unit: r.unit,
            price: r.price,
            foodId: r.foodId,
            grams: r.grams,
            matchedName: r.matchedName,
            category: r.category
        }));
        const store = ($('rc-store') || {}).value || 'Other';
        const date = ($('rc-date') || {}).value || todayUTC();
        const enteredTotal = parseFloat(($('rc-total') || {}).value) || 0;
        const computed = items.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
        
        // Expected vs actual total comparison
        if (enteredTotal > 0 && Math.abs(enteredTotal - computed) > 0.01) {
            const diff = enteredTotal - computed;
            const pct = computed > 0 ? Math.round((diff / computed) * 100) : 0;
            if (!confirm(`Entered total (${enteredTotal.toFixed(2)}) differs from item sum (${computed.toFixed(2)}) by ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct}%). Save anyway?`)) {
                return;
            }
        }
        
        const receipt = {
            id: 'rc_' + Date.now(),
            store,
            date,
            total: enteredTotal || Math.round(computed * 100) / 100,
            currency: (state.settings.shopping && state.settings.shopping.currency) || 'MUR',
            items,
            enteredTotal
        };

        // Price comparison
        const currency = receipt.currency;
        const SYM = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const fmt = n => (SYM[currency] || '') + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const comparisons = [];
        items.forEach(it => {
            if (!it.foodId) return;
            const pantryItem = state.pantryItems.find(p => p.ingredientFoodId === it.foodId && p.isTracked);
            const ingredient = state.ingredients.find(i => i.foodId === it.foodId);

            const receiptPrice = it.price && it.grams ? (it.price / it.grams) : 0;
            const pantryPrice = pantryItem && pantryItem.price && pantryItem.packSize ? (pantryItem.price / pantryItem.packSize) : 0;
            const ingredientPrice = ingredient && ingredient.averagePrice ? (ingredient.averagePrice / (ingredient.priceBasisGrams || ingredient.servingSizeG || 100)) : 0;

            const lastPrice = pantryItem ? (pantryItem.lastPrice || pantryPrice) : (ingredientPrice || 0);

            if (receiptPrice > 0 && lastPrice > 0) {
                const pct = lastPrice > 0 ? Math.round(((receiptPrice - lastPrice) / lastPrice) * 100) : 0;
                comparisons.push({
                    foodId: it.foodId,
                    name: it.name,
                    receiptPrice: Math.round(receiptPrice * 10000) / 10000,
                    lastPrice: Math.round(lastPrice * 10000) / 10000,
                    pct,
                    pantryItem,
                    ingredient,
                    item: it
                });
            }
        });

        if (comparisons.length > 0) {
            await showPriceComparisonDialog(comparisons, receipt, fmt);
        }

        // Save receipt
        const receipts = Array.isArray(state.receipts) ? state.receipts.slice() : [];
        receipts.unshift(receipt);
        state.receipts = receipts;
        await api('/api/receipts', 'PUT', receipts);
        note('Receipt saved (' + items.length + ' item(s)).', true);
        renderParsed(parsed); // reset to read-only parsed view
    }

    function showPriceComparisonDialog(comparisons, receipt, fmt) {
        return new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'modal-overlay';
            dialog.innerHTML = `
                <div class="modal-content" style="max-width: 90vw; margin: 1rem;" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3 style="margin:0;color:var(--text-main);"><i data-lucide="tag" style="width:20px;height:20px;vertical-align:-3px;"></i> Price Changes Detected</h3>
                        <button class="modal-close" aria-label="Close"><i data-lucide="x"></i></button>
                    </div>
                    <div style="padding:1.5rem;max-height:70vh;overflow-y:auto;">
                        <p style="margin-bottom:1rem;color:var(--text-muted);font-size:.9rem;">The following items from your receipt have price differences vs. your recorded prices. Review and choose which to update.</p>
                        <div style="display:flex;gap:.5rem;margin-bottom:1rem;padding:.5rem;background:var(--bg-raised);border-radius:6px;font-size:.8rem;">
                            <span style="flex:1;font-weight:600;">Item</span>
                            <span style="width:100px;text-align:right;font-weight:600;">Last Price</span>
                            <span style="width:100px;text-align:right;font-weight:600;">Receipt Price</span>
                            <span style="width:80px;text-align:center;font-weight:600;">Change</span>
                            <span style="width:120px;text-align:center;font-weight:600;">Action</span>
                        </div>
                        ${comparisons.map((c, i) => `
                            <div style="display:flex;gap:.5rem;padding:.5rem;border-bottom:1px solid var(--border);align-items:center;">
                                <span style="flex:1;font-size:.85rem;">${esc(c.name)}</span>
                                <span style="width:100px;text-align:right;font-size:.85rem;">${fmt(c.lastPrice)}</span>
                                <span style="width:100px;text-align:right;font-size:.85rem;">${fmt(c.receiptPrice)}</span>
                                <span style="width:80px;text-align:center;font-size:.85rem;color:${c.pct > 0 ? 'var(--accent-meat)' : c.pct < 0 ? 'var(--accent-veg)' : 'var(--text-muted)'};">
                                    ${c.pct >= 0 ? '+' : ''}${c.pct}%
                                </span>
                                <span style="width:120px;text-align:center;">
                                    <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">
                                        <input type="checkbox" data-idx="${i}" ${c.pct !== 0 ? 'checked' : ''}>
                                        <span style="font-size:.75rem;">Update</span>
                                    </label>
                                </span>
                            </div>
                        `).join('')}
                        <div style="margin-top:1.5rem;display:flex;justify-content:flex-end;gap:.5rem;">
                            <button class="btn secondary" id="price-cmp-cancel">Cancel</button>
                            <button class="btn primary" id="price-cmp-ok">Update Selected Prices</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(dialog);
            if (window.lucide) window.lucide.createIcons();

            const close = () => { dialog.remove(); resolve(); };
            dialog.querySelector('.modal-close').onclick = close;
            dialog.onclick = (e) => { if (e.target === dialog) close(); };
            dialog.querySelector('#price-cmp-cancel').onclick = close;
            dialog.querySelector('#price-cmp-ok').onclick = async () => {
                const checks = dialog.querySelectorAll('input[type="checkbox"]:checked');
                for (const cb of checks) {
                    const idx = parseInt(cb.dataset.idx);
                    const c = comparisons[idx];
                    if (!c) continue;
                    const newPrice = c.receiptPrice;
                    const obs = { date: receipt.date, price: newPrice };
                    const apply = window.LarderCalc && window.LarderCalc.applyPriceUpdate;
                    // Update pantry item via applyPriceUpdate (single writer)
                    if (c.pantryItem) {
                        const upd = apply ? apply(c.pantryItem, obs)
                            : { history: c.pantryItem.priceHistory || [], averagePrice: c.pantryItem.averagePrice || 0, lastPrice: newPrice, lastPriceDate: receipt.date };
                        c.pantryItem.priceHistory = upd.history;
                        c.pantryItem.averagePrice = upd.averagePrice;
                        c.pantryItem.lastPrice = upd.lastPrice;
                        c.pantryItem.lastPriceDate = upd.lastPriceDate;
                        if (c.pantryItem.priceHistory && !c.pantryItem.priceHistory.some(x => x.brand)) {
                            c.pantryItem.priceHistory.forEach(h => { if (!h.brand && c.pantryItem.brand) h.brand = c.pantryItem.brand; });
                        }
                    }
                    // Update ingredient via applyPriceUpdate (single writer)
                    if (c.ingredient) {
                        const upd = apply ? apply(c.ingredient, obs)
                            : { history: c.ingredient.priceHistory || [], averagePrice: c.ingredient.averagePrice || 0, lastPrice: newPrice, lastPriceDate: receipt.date };
                        c.ingredient.priceHistory = upd.history;
                        c.ingredient.averagePrice = upd.averagePrice;
                        c.ingredient.lastPrice = upd.lastPrice;
                        c.ingredient.lastPriceDate = upd.lastPriceDate;
                    }
                }
                // Persist
                await Promise.all([
                    api('/api/pantry-items', 'PUT', state.pantryItems),
                    api('/api/ingredients', 'PUT', state.ingredients)
                ]);
                close();
            };
        });
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