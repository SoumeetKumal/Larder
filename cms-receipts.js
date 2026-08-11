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
        container.innerHTML = `<div class="planner-wrap rc-page"><div class="rc-top">${anHTML}${addForm}</div>${listHTML}</div>`;
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
            S.receipts.push({
                id: 'rc_' + Date.now(),
                store, date, total: total || Math.round(computed * 100) / 100,
                currency: currency,
                items,
                enteredTotal: total
            });
            await App.saveReceipts();
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

    root.CMSReceipts = { render: renderReceipts };
})(typeof self !== 'undefined' ? self : this);
