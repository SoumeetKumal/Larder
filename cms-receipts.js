// Larder CMS Receipts tab (extracted from cms.js). Reads shared state via
// window.CMSState, pure helpers via window.LarderCalcUtils, and calls back into
// the cms.js shell (save fns) via window.CMSApp.
(function (root) {
    'use strict';
    const S = root.CMSState || {};
    const U = root.LarderCalcUtils || {};
    const LC = root.LarderCalc || { matchIngredient: () => null, parseLine: () => null, parseReceiptText: () => [] };

    function renderReceipts() {
        const App = root.CMSApp;
        const container = document.getElementById('cms-recipe-list');
        if (!container) return;

        const currency = (S.appSettings.shopping && S.appSettings.shopping.currency)
            || (S.ingredients.find(i => parseFloat(i.averagePrice) > 0) || {}).priceCurrency
            || 'MUR';
        const SYM = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const fmt = n => (SYM[currency] || '') + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const budget = parseFloat(S.appSettings.shopping && S.appSettings.shopping.amount) || 0;

        const norm = s => String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        function matchIngredient(name) { return LC.matchIngredient(name, S.ingredients); }
        function matchNote(name) {
            const ing = matchIngredient(name);
            if (!ing) return { text: 'no match', cls: 'red-note' };
            return { text: '→ ' + ing.name, cls: 'blue-note' };
        }

        // Heuristic parse of a pasted receipt/OCR line (shared module).
        function parseLine(line) { return LC.parseLine(line); }
        function parseReceiptText(text) { return LC.parseReceiptText(text, S.ingredients); }

        // ---- Shopping analytics (derived from receipts) ----
        const sorted = S.receipts.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const totalSpend = S.receipts.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
        const thisMonthKey = new Date().toISOString().slice(0, 7);
        const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastMonthKey = lastMonth.toISOString().slice(0, 7);
        const thisMonthSpend = S.receipts.filter(r => (r.date || '').startsWith(thisMonthKey)).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
        const lastMonthSpend = S.receipts.filter(r => (r.date || '').startsWith(lastMonthKey)).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);

        const storeTotals = {};
        S.receipts.forEach(r => {
            const st = r.store || 'Other';
            storeTotals[st] = (storeTotals[st] || 0) + (parseFloat(r.total) || 0);
        });
        const storeRows = Object.entries(storeTotals).sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([st, amt]) => `<div class="rc-store-row"><span class="rc-store-name">${U.escapeHtml(st)}</span><div class="pl-total-bar" style="flex:1"><div class="pl-total-fill blue" style="width:${totalSpend ? Math.min(100, amt / totalSpend * 100) : 0}%"></div></div><span class="rc-store-amt">${fmt(amt)}</span></div>`).join('');

        // Last 8 weeks spend trend
        function weekKey(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x.toISOString().slice(0, 10); }
        const wkSpend = {};
        S.receipts.forEach(r => { const k = weekKey(r.date); wkSpend[k] = (wkSpend[k] || 0) + (parseFloat(r.total) || 0); });
        const wkToday = weekKey(new Date().toISOString().slice(0, 10));
        const wkStart = new Date(wkToday); wkStart.setDate(wkStart.getDate() - 7 * 7);
        const wkLabels = [], wkVals = []; let wkMax = 0;
        for (let i = 0; i <= 7; i++) {
            const d = new Date(wkStart); d.setDate(d.getDate() + 7 * i);
            const k = weekKey(d.toISOString().slice(0, 10));
            const v = wkSpend[k] || 0;
            wkLabels.push(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
            wkVals.push(v);
            if (v > wkMax) wkMax = v;
        }
        const trendBars = wkVals.map((v, i) => `<div class="rc-trend-col"><div class="rc-trend-bar-wrap"><div class="rc-trend-bar ${wkLabels[i] === wkToday ? 'thiswk' : ''}" style="height:${wkMax ? Math.max(3, v / wkMax * 60) : 3}px"></div></div><div class="rc-trend-lbl">${wkLabels[i]}</div><div class="rc-trend-val">${fmt(v)}</div></div>`).join('');

        const budgetCls = budget > 0 && thisMonthSpend > budget ? 'red' : 'blue';
        const budgetNote = budget > 0 ? (thisMonthSpend > budget ? 'over budget' : `remaining ${fmt(budget - thisMonthSpend)}`) : 'no budget set';

        const anHTML = `
        <div class="planner-card rc-analytics">
            <div class="planner-card-head"><i data-lucide="chart-pie" style="width:18px;height:18px;"></i> Shopping analytics <span class="planner-hint">from captured receipts</span></div>
            <div class="rc-kpis">
                <div class="rc-kpi"><div class="rc-kpi-label">This month</div><div class="rc-kpi-val ${budgetCls}">${fmt(thisMonthSpend)}</div><div class="rc-kpi-sub">${budgetNote}</div></div>
                <div class="rc-kpi"><div class="rc-kpi-label">Last month</div><div class="rc-kpi-val">${fmt(lastMonthSpend)}</div><div class="rc-kpi-sub">${lastMonthSpend ? (thisMonthSpend - lastMonthSpend) >= 0 ? '+' + fmt(thisMonthSpend - lastMonthSpend) : fmt(thisMonthSpend - lastMonthSpend) : ''}</div></div>
                <div class="rc-kpi"><div class="rc-kpi-label">All time</div><div class="rc-kpi-val">${fmt(totalSpend)}</div><div class="rc-kpi-sub">${S.receipts.length} receipt${S.receipts.length === 1 ? '' : 's'}</div></div>
                <div class="rc-kpi"><div class="rc-kpi-label">Avg / receipt</div><div class="rc-kpi-val">${fmt(S.receipts.length ? totalSpend / S.receipts.length : 0)}</div><div class="rc-kpi-sub">${budget ? 'budget ' + fmt(budget) : ''}</div></div>
            </div>
            <div class="rc-split">
                <div class="rc-spend-trend"><div class="rc-subhead">Spend · last 8 weeks</div><div class="rc-trend-wrap">${trendBars}</div></div>
                <div class="rc-stores"><div class="rc-subhead">By store</div>${storeRows || '<div class="empty-state" style="padding:.4rem">No receipts yet.</div>'}</div>
            </div>
        </div>`;

        // ---- Price History Chart ----
        const priceHistoryHTML = (() => {
            // Collect price history from pantry items and ingredients
            const histories = {};
            S.pantryItems.forEach(p => {
                if (p.priceHistory && p.priceHistory.length > 1) {
                    histories[p.ingredientFoodId] = histories[p.ingredientFoodId] || { name: p.productName, points: [] };
                    p.priceHistory.forEach(h => histories[p.ingredientFoodId].points.push({ date: h.date, price: h.price }));
                }
            });
            S.ingredients.forEach(i => {
                if (i.priceHistory && i.priceHistory.length > 1) {
                    histories[i.foodId] = histories[i.foodId] || { name: i.name, points: [] };
                    i.priceHistory.forEach(h => histories[i.foodId].points.push({ date: h.date, price: h.price }));
                }
            });
            const items = Object.entries(histories);
            if (items.length === 0) return '';
            // Build chart data
            const allDates = new Set();
            items.forEach(([_, data]) => data.points.forEach(p => allDates.add(p.date)));
            const sortedDates = Array.from(allDates).sort();
            const minPrice = Math.min(...items.flatMap(([_, d]) => d.points.map(p => p.price)));
            const maxPrice = Math.max(...items.flatMap(([_, d]) => d.points.map(p => p.price)));
            const priceRange = maxPrice - minPrice || 1;
            const chartHeight = 120;
            const chartWidth = Math.max(400, sortedDates.length * 40);
            
            let svgPaths = '';
            let legendHTML = '';
            const colors = ['#5c90c6', '#d1777d', '#7ebc59', '#e8b84d', '#c47fd5', '#5cc8c8', '#f39c12', '#e74c3c'];
            items.forEach(([foodId, data], idx) => {
                const pts = data.points.sort((a, b) => a.date.localeCompare(b.date));
                if (pts.length < 2) return;
                const path = pts.map((p, i) => {
                    const x = (i / (pts.length - 1)) * chartWidth;
                    const y = chartHeight - ((p.price - minPrice) / priceRange) * (chartHeight - 20) - 10;
                    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(' ');
                svgPaths += `<path d="${path}" stroke="${colors[idx % colors.length]}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />`;
                legendHTML += `<span style="display:inline-flex;align-items:center;gap:.25rem;margin-right:.75rem;font-size:.75rem;color:var(--text-secondary);"><span style="width:12px;height:2px;background:${colors[idx % colors.length]};border-radius:1px;"></span> ${U.escapeHtml(data.name)}</span>`;
            });
            
            return `
            <div class="planner-card rc-price-history">
                <div class="planner-card-head"><i data-lucide="chart-line" style="width:18px;height:18px;"></i> Price History <span class="planner-hint">from receipts & pantry items</span></div>
                <div class="rc-price-chart" style="position:relative;height:140px;margin-bottom:.75rem;background:var(--bg-surface);border-radius:8px;overflow:hidden;">
                    <svg width="${chartWidth + 20}" height="${chartHeight + 20}" viewBox="0 0 ${chartWidth + 20} ${chartHeight + 20}" style="display:block;margin:10px auto;">
                        <!-- Grid lines -->
                        ${[0, 0.25, 0.5, 0.75, 1].map(f => {
                            const y = 10 + f * (chartHeight - 20);
                            const val = maxPrice - f * priceRange;
                            return `<line x1="10" y1="${y.toFixed(1)}" x2="${chartWidth + 10}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5" /><text x="5" y="${(y + 3).toFixed(1)}" font-size="8" fill="var(--text-muted)" text-anchor="end">${val.toFixed(0)}</text>`;
                        }).join('')}
                        ${svgPaths}
                    </svg>
                </div>
                <div class="rc-price-legend" style="display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;padding:.5rem 0;">${legendHTML}</div>
            </div>`;
        })();

        // ---- Add-receipt form ----
        const storesList = [...new Set(S.receipts.map(r => r.store).filter(Boolean))];
        const storeOpts = storesList.map(s => `<option value="${U.escapeHtml(s)}">`).join('');
        const addForm = `
        <div class="planner-card">
            <div class="planner-card-head"><i data-lucide="receipt" style="width:18px;height:18px;"></i> Add a receipt <span class="planner-hint">paste receipt text, or fill items manually &mdash; names auto-match to ingredients</span></div>
            <div class="rc-form-grid">
                <div class="rc-f"><label>Store</label><input class="seamless-input" id="rc-store" list="rc-store-list" placeholder="e.g. Winner's"><datalist id="rc-store-list">${storeOpts}</datalist></div>
                <div class="rc-f"><label>Date</label><input type="date" class="seamless-input" id="rc-date" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="rc-f"><label>Total</label><input type="number" class="seamless-input" id="rc-total" placeholder="0.00" step="any" style="width:110px"></div>
            </div>
            <div class="rc-f"><label>Pasted receipt text (<span class="planner-hint">one item per line, e.g. "Rice 2kg 145.00"</span>)</label><textarea class="seamless-input seamless-textarea" id="rc-paste" rows="2"></textarea><button class="btn secondary" id="rc-parse-btn" style="margin-top:.5rem;font-size:14px">Parse lines</button></div>
            <div class="rc-items-head">Items</div>
            <div id="rc-items-rows"></div>
            <div class="rc-selected-line">Matched price <strong id="rc-calc-total">${fmt(0)}</strong></div>
            <div class="planner-card-actions"><button class="btn primary" id="rc-save-btn">Save receipt</button><span class="pln-note" id="rc-save-note"></span></div>
        </div>`;

        // ---- Receipt list ----
        const rcCards = S.receipts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((r, i) => {
            const rowsH = (r.items || []).map(it => {
                const ms = matchIngredient(it.name);
                const badge = ms ? `<span class="pln-tag">→ ${U.escapeHtml(ms.name)}</span>` : '<span class="pln-tag-grey">no match</span>';
                return `<li class="rc-item"><div class="rc-item-name">${U.escapeHtml(it.name)}</div><div class="rc-item-mid">${it.qty || 1} ${U.escapeHtml(it.unit || '')}</div><div class="rc-item-price">${fmt(it.price)}</div>${badge}</li>`;
            }).join('');
            const matched = (r.items || []).filter(it => it.foodId || matchIngredient(it.name)).length;
            return `
            <div class="planner-card" data-rcid="${r.id}">
                <div class="rc-list-head">
                    <div class="rc-store-title">${U.escapeHtml(r.store || 'Receipt')}</div>
                    <div class="rc-date">${U.escapeHtml(U.formatDateDMY(r.date))}</div>
                    <div class="rc-total">${fmt(r.total)}</div>
                </div>
                <div class="rc-item-count">${(r.items || []).length} line(s) &middot; ${matched} matched</div>
                <ul class="rc-item-list">${rowsH}</ul>
                <div class="rc-list-actions">
                    <button class="btn secondary rc-to-pantry" data-id="${r.id}" style="font-size:13px">Add items to pantry</button>
                    <button class="btn secondary danger rc-del" data-id="${r.id}" style="font-size:13px">Delete</button>
                </div>
            </div>`;
        }).join('');

        const listHTML = `
        <div class="planner-card rc-list-card">
            <div class="planner-card-head"><i data-lucide="receipt-text" style="width:18px;height:18px;"></i> Receipts <span class="planner-hint">${S.receipts.length} recorded</span></div>
            <div class="rc-list-scroll">${rcCards || '<div class="empty-state">No receipts yet &mdash; add your first one above.</div>'}</div>
        </div>`;

        function unitToGrams(unit, ing) {
            const u = (unit || 'g').toLowerCase();
            const UN = { g: 1, gram: 1, kg: 1000, kgs: 1000, ml: 1, l: 1000, litre: 1000, pc: 1, each: 1, bottle: 1, bag: 1, pack: 1, packet: 1, can: 1, tin: 1 };
            if (u in UN) return UN[u];
            return parseFloat(ing && ing.servingSizeG) || 100;
        }
        container.innerHTML = `<div class="planner-wrap rc-page"><div class="rc-top">${anHTML}${priceHistoryHTML}${addForm}</div>${listHTML}</div>`;
        if (root.lucide) root.lucide.createIcons();

        // Build item rows (for manual entry)
        let itemRows = [];
        function renderItemRows() {
            const wrap = container.querySelector('#rc-items-rows');
            if (!wrap) return;
            wrap.innerHTML = itemRows.map((it, i) => `
                <div class="rc-man-item" data-idx="${i}">
                    <input type="text" class="seamless-input rc-man-name" data-idx="${i}" value="${U.escapeHtml(it.name)}" placeholder="Item name">
                    <input type="number" class="seamless-input rc-man-qty" data-idx="${i}" value="${it.qty}" step="any" style="width:60px">
                    <input type="text" class="seamless-input rc-man-unit" data-idx="${i}" value="${it.unit || 'g'}" style="width:46px">
                    <input type="number" class="seamless-input rc-man-price" data-idx="${i}" value="${it.price || ''}" step="any" style="width:90px">
                    <span class="rc-man-match" data-idx="${i}"></span>
                    <button class="rc-rm" data-idx="${i}" title="Remove">&times;</button>
                </div>`).join('');
            wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
                const i2 = parseInt(inp.dataset.idx);
                if (!itemRows[i2]) return;
                if (inp.classList.contains('rc-man-name')) itemRows[i2].name = inp.value;
                else if (inp.classList.contains('rc-man-qty')) itemRows[i2].qty = parseFloat(inp.value) || 0;
                else if (inp.classList.contains('rc-man-unit')) itemRows[i2].unit = inp.value;
                else if (inp.classList.contains('rc-man-price')) itemRows[i2].price = parseFloat(inp.value) || 0;
                updateCalc();
                renderMatches();
            }));
            wrap.querySelectorAll('.rc-rm').forEach(btn => btn.addEventListener('click', () => {
                itemRows.splice(parseInt(btn.dataset.idx), 1);
                renderItemRows(); updateCalc();
            }));
        }
        function renderMatches() {
            container.querySelectorAll('.rc-man-item').forEach(eli2 => {
                const i2 = parseInt(eli2.dataset.idx);
                if (!itemRows[i2]) return;
                const ing = matchIngredient(itemRows[i2].name);
                const el = eli2.querySelector('.rc-man-match');
                if (el) el.textContent = ing ? '→ ' + ing.name : '';
                el.classList.toggle('blue-note', !!ing);
                el.classList.toggle('red-note', !ing);
            });
        }
        function updateCalc() {
            const tot = itemRows.reduce((s, it) => s + ((it.price || 0) * ((it.qty || 0) || 1)), 0);
            const el = container.querySelector('#rc-calc-total');
            if (el) el.textContent = fmt(tot);
        }
        renderItemRows();
        renderMatches();

        // parse button
        const parseBtn = container.querySelector('#rc-parse-btn');
        if (parseBtn) parseBtn.addEventListener('click', () => {
            const text = (container.querySelector('#rc-paste') || {}).value || '';
            const parsed = parseReceiptText(text);
            if (!parsed.length) { alert('Could not parse any lines.'); return; }
            // match existing rows by name, else append
            parsed.forEach(l => {
                const existing = itemRows.find(x => norm(x.name) === norm(l.name));
                if (existing) { existing.qty += l.qty; existing.price = existing.price || l.price; }
                else itemRows.push({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, foodId: l.foodId, grams: l.grams });
            });
            const totEl = container.querySelector('#rc-total');
            const sum = itemRows.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
            if (totEl && !(parseFloat(totEl.value) > 0)) totEl.value = Math.round(sum * 100) / 100;
            renderItemRows();
            renderMatches();
            updateCalc();
        });

        // save
        const saveBtn = container.querySelector('#rc-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', async () => {
            const store = (container.querySelector('#rc-store') || {}).value.trim() || 'Other';
            const date = (container.querySelector('#rc-date') || {}).value || new Date().toISOString().slice(0, 10);
            const total = parseFloat(container.querySelector('#rc-total').value) || 0;
            const items = itemRows.map(it => {
                const ing = matchIngredient(it.name);
                return { name: it.name, qty: it.qty, unit: it.unit || 'g', price: it.price || 0, foodId: ing ? ing.foodId : null, matchedName: ing ? ing.name : null };
            });
            const computed = items.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
            const newReceipt = {
                id: 'rc_' + Date.now(),
                store, date, total: total || Math.round(computed * 100) / 100,
                currency: currency,
                items,
                enteredTotal: total
            };
            S.receipts.push(newReceipt);
            await App.saveReceipts();

            // --- Price comparison: compare receipt items with pantry/ingredient prices ---
            await showPriceComparison(newReceipt, S, U, App);
            
            renderReceipts();
            return;
        });

        // list actions
        container.querySelectorAll('.rc-to-pantry').forEach(btn => btn.addEventListener('click', async () => {
            const r = S.receipts.find(x => String(x.id) === String(btn.dataset.id));
            if (!r) return;
            let added = 0;
            (r.items || []).forEach(it => {
                const ing = matchIngredient(it.name);
                if (!ing) return;
                const cur = S.pantry.find(p => p.foodId === ing.foodId);
                const grams = it.grams || ((parseFloat(it.qty) || 1) * (unitToGrams(it.unit, ing) || 1));
                if (cur) cur.quantity = (parseFloat(cur.quantity) || 0) + grams;
                else S.pantry.push({ foodId: ing.foodId, isTracked: true, quantity: grams });
                added++;
            });
            if (added) { await App.savePantry(); }
            const note = container.querySelector('#rc-save-note');
            if (note) { note.textContent = `Added ${added} item(s) to pantry.`; setTimeout(() => { note.textContent = ''; }, 2000); }
        }));
        container.querySelectorAll('.rc-del').forEach(btn => btn.addEventListener('click', async () => {
            S.receipts = S.receipts.filter(x => String(x.id) !== String(btn.dataset.id));
            await App.saveReceipts();
            renderReceipts();
        }));
    }

    // --- Price Comparison Dialog ---
    async function showPriceComparison(receipt, S, U, App) {
        const currency = (S.appSettings.shopping && S.appSettings.shopping.currency)
            || (S.ingredients.find(i => parseFloat(i.averagePrice) > 0) || {}).priceCurrency
            || 'MUR';
        const SYM = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const fmt = n => (SYM[currency] || '') + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const comparisons = [];
        (receipt.items || []).forEach(it => {
            if (!it.foodId) return;
            // Find pantry item
            const pantryItem = S.pantryItems.find(p => p.ingredientFoodId === it.foodId && p.isTracked);
            const ingredient = S.ingredients.find(i => i.foodId === it.foodId);
            
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
                    ingredient
                });
            }
        });

        if (comparisons.length === 0) return;

        // Build dialog
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
            <div class="modal-content" style="max-width: 700px;" onclick="event.stopPropagation()">
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
                            <span style="flex:1;font-size:.85rem;">${U.escapeHtml(c.name)}</span>
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

        return new Promise(resolve => {
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
                    // Update pantry item
                    if (c.pantryItem) {
                        c.pantryItem.priceHistory = c.pantryItem.priceHistory || [];
                        c.pantryItem.priceHistory.push({ date: receipt.date, price: newPrice });
                        c.pantryItem.priceHistory.sort((a, b) => a.date.localeCompare(b.date));
                        c.pantryItem.lastPrice = newPrice;
                        c.pantryItem.lastPriceDate = receipt.date;
                        // Recompute average
                        const sum = c.pantryItem.priceHistory.reduce((s, h) => s + h.price, 0);
                        c.pantryItem.averagePrice = c.pantryItem.priceHistory.length ? sum / c.pantryItem.priceHistory.length : 0;
                    }
                    // Update ingredient
                    if (c.ingredient) {
                        c.ingredient.priceHistory = c.ingredient.priceHistory || [];
                        c.ingredient.priceHistory.push({ date: receipt.date, price: newPrice });
                        c.ingredient.priceHistory.sort((a, b) => a.date.localeCompare(b.date));
                        c.ingredient.averagePrice = c.ingredient.priceHistory.length ? c.ingredient.priceHistory.reduce((s, h) => s + h.price, 0) / c.ingredient.priceHistory.length : 0;
                    }
                }
                // Persist
                await Promise.all([
                    App.savePantryItems ? App.savePantryItems() : Promise.resolve(),
                    App.saveIngredients ? App.saveIngredients() : Promise.resolve()
                ]);
                close();
            };
        });
    }

    root.CMSReceipts = { render: renderReceipts };
})(typeof self !== 'undefined' ? self : this);
