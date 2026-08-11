// Larder CMS Monthly Planner tab (extracted from cms.js). Reads shared state
// via window.CMSState, pure helpers via window.LarderCalcUtils, and calls back
// into the cms.js shell (save fns, tab switching) via window.CMSApp.
(function (root) {
    'use strict';
    const S = root.CMSState || {};
    const U = root.LarderCalcUtils || {};
    const LC = root.LarderCalc || { gramsOf: (a, u) => (parseFloat(a) || 0) * ((u === 'kg' || u === 'l') ? 1000 : 1), perGram: () => 0, computeTotals: () => ({ energy: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, satFatG: 0, fiber: 0, sodiumMg: 0, potassiumMg: 0, calciumMg: 0, magnesiumMg: 0, phosphorusMg: 0, ironMg: 0, zincMg: 0, copperMg: 0, seleniumMcg: 0, vitaminAMcg: 0, vitaminCMg: 0, vitaminDMcg: 0, vitaminEMg: 0, vitaminKMcg: 0, thiaminMg: 0, riboflavinMg: 0, niacinMg: 0, vitaminB6Mg: 0, folateMcg: 0, vitaminB12Mcg: 0, animal: 0, meat: 0, cost: 0 }) };

    function renderPlanner() {
        const container = document.getElementById('cms-recipe-list');
        if (!container) return;

const goals = Object.assign({
            energyMin: 0, energyMax: 0, carbsMin: 0, carbsMax: 0,
            proteinMin: 0, proteinMax: 0, fatMin: 0, fatMax: 0,
            satFatMax: 0, transFatMax: 0, fiberMin: 0,
            sodiumMax: 0, potassiumMin: 0, potassiumMax: 0, calciumMin: 0,
            magnesiumMin: 0, magnesiumMax: 0, phosphorusMin: 0, phosphorusMax: 0,
            ironMin: 0, ironMax: 0, zincMin: 0, zincMax: 0,
            copperMin: 0, copperMax: 0, seleniumMin: 0, seleniumMax: 0,
            vitAMin: 0, vitAMax: 0, vitCMin: 0, vitCMax: 0, vitDMin: 0, vitDMax: 0,
            vitEMin: 0, vitEMax: 0, vitKMin: 0, vitKMax: 0,
            thiaminMin: 0, thiaminMax: 0, riboflavinMin: 0, riboflavinMax: 0,
            niacinMin: 0, niacinMax: 0, vitB6Min: 0, vitB6Max: 0,
            folateMin: 0, folateMax: 0, b12Min: 0, b12Max: 0,
            meatProteinPct: 50, budget: 0, currency: ''
        }, S.planner.goals || {});
        const currency = goals.currency
            || (S.appSettings.shopping && S.appSettings.shopping.currency)
            || (S.ingredients.find(i => parseFloat(i.averagePrice) > 0) || {}).priceCurrency
            || 'MUR';
        const SYM = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const fmt = n => (SYM[currency] || '') + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        function findIng(id) { return S.ingredients.find(f => f.foodId === id); }
        function gramsOf(item) { return LC.gramsOf(item && item.amount, item && item.unit, findIng(item.ingredientId)); }
        function perGramOf(ing) { return LC.perGram(ing); }

        // Energy & Macros goals come from the eater profiles by default: sum every
        // eater's daily targets and scale to a 30-day month. Prefills the goal
        // inputs but stays editable as a manual override.
        function profileMonthTargets() {
            const profiles = (S.appSettings.profiles && S.appSettings.profiles.length)
                ? S.appSettings.profiles
                : [{ name: 'User', calories: 2000, carbs: 40, protein: 30, fat: 30 }];
            const num = v => (parseFloat(v) || 0);
            const daily = { energy: 0, protein: 0, carbs: 0, fat: 0 };
            profiles.forEach(p => {
                const cal = num(p.calories);
                daily.energy += cal;
                daily.protein += Math.round(cal * (num(p.protein) / 100) / 4);
                daily.carbs += Math.round(cal * (num(p.carbs) / 100) / 4);
                daily.fat += Math.round(cal * (num(p.fat) / 100) / 9);
            });
            return {
                energy: Math.round(daily.energy * 30),
                protein: Math.round(daily.protein * 30),
                carbs: Math.round(daily.carbs * 30),
                fat: Math.round(daily.fat * 30)
            };
        }
        const macroDefaults = profileMonthTargets();
        const macroKeys = { energy: 'energy', protein: 'protein', carbs: 'carbs', fat: 'fat' };
        // Effective goal for a key: the saved value if set, else the profile-derived
        // month target. Used by the goal inputs, the flag() checks and total bars.
        function effGoal(key) {
            const v = parseFloat(goals[key]) || 0;
            if (v > 0) return v;
            const base = key.replace(/Min$|Max$/, '');
            return macroKeys[base] ? macroDefaults[macroKeys[base]] : 0;
        }

        const t = LC.computeTotals(S.planner.items, S.ingredients);

        // Unified unit list shared by the planner builder (add + per-item rows).
        // Standardised across the app for consistent buys/weights.
        const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'cups', 'tbsp', 'tsp',
            'piece', 'pieces', 'each', 'whole', 'clove', 'cloves', 'slice', 'slices',
            'can', 'cans', 'pinch', 'sprig', 'sprigs', 'bunch', 'medium', 'large', 'small', 'head'];
        function unitSelect(cur, attrs) {
            const safe = (cur || 'g') === '' ? 'g' : (cur || 'g');
            const opts = UNIT_OPTIONS.concat(safe).filter((v, i, a) => a.indexOf(v) === i);
            return `<select class="${attrs.cls || 'pl-unit sel-unit'}" ${attrs.id ? `id="${attrs.id}"` : ''} ${attrs.data || ''}>
                ${opts.map(u => `<option value="${U.escapeHtml(u)}" ${u === safe ? 'selected' : ''}>${U.escapeHtml(u)}</option>`).join('')}
            </select>`;
        }

function flag(minKey, maxKey, value) {
            const mn = parseFloat(effGoal(minKey)) || 0;
            const mx = parseFloat(effGoal(maxKey)) || 0;
            if (mx > 0 && value > mx) return 'over';
            if (mn > 0 && value < mn) return 'under';
            if (mx > 0 || mn > 0) return 'ok';
            return '';
        }
function totalRow(label, value, unit, minKey, maxKey) {
            const fg = flag(minKey, maxKey, value);
            const mx = parseFloat(effGoal(maxKey)) || 0;
            const mn = parseFloat(effGoal(minKey)) || 0;
            const barPct = mx > 0 ? Math.min(100, value / mx * 100) : (mn > 0 ? Math.min(100, value / mn * 100) : 0);
            const isOver = fg === 'over';
            const isUnder = fg === 'under';
            const cls = (isOver || isUnder) ? 'red' : 'blue';
            // Arrow indicator saves horizontal space vs a text flag.
            const arrow = isOver ? '&#9650;' : (isUnder ? '&#9660;' : '&nbsp;');
            const title = isOver ? 'Over target' : (isUnder ? 'Under target' : '');
            const target = mx > 0 ? mx : (mn > 0 ? mn : 0);
            const valueTxt = value.toFixed(0).toLocaleString();
            const targetTxt = target > 0 ? target.toLocaleString() : '';
            return `<div class="pl-total-row">
                <div class="pl-total-label" title="${U.escapeHtml(label)}">${U.escapeHtml(label)}</div>
                <div class="pl-total-bar"><div class="pl-total-fill ${cls}" style="width:${barPct}%"></div></div>
                <div class="pl-total-val ${cls}"><span class="pl-total-now">${valueTxt}<span class="pl-total-unit">${unit}</span></span>${target > 0 ? `<span class="pl-total-target">/ ${targetTxt}${unit}</span>` : ''}</div>
                <div class="pl-total-flag ${cls}" title="${title}">${arrow}</div>
            </div>`;
        }

// --- Goals card ---
        // A group keeps the grid tidy: headings first, then each nutrient that
        // maps to a min/max input. Micro fields use their computed-total keys.
        const GOAL_GROUPS = [
            {
                title: 'Energy & Macros', values: 'kcal / g',
                cells: [
                    ['energy', 'Energy', 'kcal', 'both'],
                    ['protein', 'Protein', 'g', 'both'],
                    ['carbs', 'Carbs', 'g', 'both'],
                    ['fat', 'Fat', 'g', 'both']
                ]
            },
            {
                title: 'Fats & Fibre', values: 'g',
                cells: [
                    ['satFat', 'Saturated fat', 'g', 'max'],
                    ['transFat', 'Trans fat', 'g', 'max'],
                    ['fiber', 'Fiber', 'g', 'min']
                ]
            },
            {
                title: 'Minerals', values: 'mg (Se μg)',
                cells: [
                    ['sodium', 'Sodium', 'mg', 'max'],
                    ['potassium', 'Potassium', 'mg', 'both'],
                    ['calcium', 'Calcium', 'mg', 'min'],
                    ['magnesium', 'Magnesium', 'mg', 'both'],
                    ['phosphorus', 'Phosphorus', 'mg', 'both'],
                    ['iron', 'Iron', 'mg', 'both'],
                    ['zinc', 'Zinc', 'mg', 'both'],
                    ['copper', 'Copper', 'mg', 'both'],
                    ['selenium', 'Selenium', 'μg', 'both']
                ]
            },
            {
                title: 'Vitamins', values: 'μg / mg',
                cells: [
                    ['vitA', 'Vitamin A', 'μg RAE', 'both'],
                    ['vitC', 'Vitamin C', 'mg', 'both'],
                    ['vitD', 'Vitamin D', 'μg', 'both'],
                    ['vitE', 'Vitamin E', 'mg', 'both'],
                    ['vitK', 'Vitamin K', 'μg', 'both'],
                    ['thiamin', 'Vitamin B1 (thiamin)', 'mg', 'both'],
                    ['riboflavin', 'Vitamin B2', 'mg', 'both'],
                    ['niacin', 'Vitamin B3 (niacin)', 'mg', 'both'],
                    ['vitB6', 'Vitamin B6', 'mg', 'both'],
                    ['folate', 'Folate (B9)', 'μg', 'both'],
                    ['b12', 'Vitamin B12', 'μg', 'both']
                ]
            }
        ];
        // Map each goal key to the computed-totals field it tracks.
        const GOAL_TOTALS = {
            energy: 'energy', protein: 'protein', carbs: 'carbs', fat: 'fat',
            satFat: 'satFat', transFat: 'transFatG', fiber: 'fiber',
            sodium: 'sodiumMg', potassium: 'potassiumMg', calcium: 'calciumMg',
            magnesium: 'magnesiumMg', phosphorus: 'phosphorusMg', iron: 'ironMg',
            zinc: 'zincMg', copper: 'copperMg', selenium: 'seleniumMcg',
            vitA: 'vitaminAMcg', vitC: 'vitaminCMg', vitD: 'vitD',
            vitE: 'vitaminEMg', vitK: 'vitaminKMcg', thiamin: 'thiaminMg',
            riboflavin: 'riboflavinMg', niacin: 'niacinMg', vitB6: 'vitaminB6Mg',
            folate: 'folateMcg', b12: 'vitaminB12Mcg'
        };
        const goalCells = GOAL_GROUPS.map((group, gi) => `
            <details class="pln-goal-group">
                <summary class="pln-goal-group-title">
                    <i data-lucide="chevron-right" class="pln-chev"></i>
                    ${group.title} <span class="pln-goal-group-unit">(${group.values})</span>
                </summary>
                <div class="pln-goal-group-grid">
                ${group.cells.map(([key, label, unit, mode]) => {
                    const showMin = mode === 'both' || mode === 'min';
                    const showMax = mode === 'both' || mode === 'max';
                    const isMacro = !!macroKeys[key];
                    const minVal = goals[key + 'Min'] || '';
                    const maxVal = goals[key + 'Max'] || '';
                    const minPh = isMacro ? effGoal(key + 'Min') : '–';
                    const maxPh = isMacro ? effGoal(key + 'Max') : '–';
                    return `
                    <div class="pln-goal-cell">
                        <div class="pln-goal-label">${label}<span class="pln-goal-unit">${unit}</span></div>
                        <div class="pln-goal-inputs">
                            ${showMin ? `<div class="pln-goal-min"><span class="pln-input-tag">min</span><input type="number" class="pln-goal-input" data-goal="${key}Min" value="${minVal}" placeholder="${minPh}"></div>` : ''}
                            ${showMax ? `<div class="pln-goal-max"><span class="pln-input-tag">max</span><input type="number" class="pln-goal-input" data-goal="${key}Max" value="${maxVal}" placeholder="${maxPh}"></div>` : ''}
                        </div>
                    </div>`;
                }).join('')}
                </div>
            </details>
        `).join('');

let html = '';
        // Toolbar: inline-editable monthly budget (auto-saves on blur) + a button
        // that opens the Monthly Nutrition Goals editor in a modal.
        html += `
        <div class="planner-wrap">
        <div class="planner-toolbar">
            <label class="pl-budget-editor" title="Monthly budget — edit in place, saved on leave">
                <i data-lucide="wallet" style="width:15px;height:15px;color:var(--accent-sea);"></i>
                <span class="pl-budget-label">Budget</span>
                <input type="number" class="pl-budget-input" value="${goals.budget || 0}" min="0" step="any">
                <span class="pl-budget-c">${currency}</span>
            </label>
            <div class="pl-toolbar-spacer"></div>
            <button class="btn secondary" id="planner-open-goals" style="font-size:14px;"><i data-lucide="target" style="width:15px;height:15px;"></i> Monthly Nutrition Goals</button>
        </div>
        <div class="planner-grid">
        <div class="planner-main">`;

// --- Live totals vs goals (all tracked nutrients, grouped like the goals) ---
        const animalPct = t.meat > 0 ? Math.round(t.animal / t.meat * 100) : 0;
        const aGoal = parseFloat(goals.meatProteinPct) || 0;
        const aCls = (aGoal > 0 && Math.abs(animalPct - aGoal) > 10) ? 'red' : (aGoal > 0 ? 'blue' : '');
        const totGroupRows = GOAL_GROUPS.map(g => `
            <div class="pl-total-group">
                <div class="pl-total-group-title">${g.title} <span class="pln-goal-group-unit">(${g.values})</span></div>
${g.cells.map(([key, label, unit]) => {
                    const totKey = GOAL_TOTALS[key];
                    const value = typeof t[totKey] === 'number' ? t[totKey] : 0;
                    return totalRow(label, value, (key === 'sodium' ? 'mg' : unit), key + 'Min', key + 'Max');
                }).join('')}
            </div>`).join('');
const overBudget = parseFloat(goals.budget) > 0 && t.cost > parseFloat(goals.budget);
        const projectedCard = `
        <aside class="planner-side">
        <div class="planner-card">
            <div class="planner-card-head"><i data-lucide="gauge" style="width:18px;height:18px;"></i> Projected month totals <span class="planner-hint">live vs your goals</span></div>
            <div class="pl-totals">${totGroupRows}\n                <div class="pl-total-row"><div class="pl-total-label">Animal protein %</div><div class="pl-total-bar"><div class="pl-total-fill ${aCls}" style="width:${Math.min(100, animalPct)}%"></div></div><div class="pl-total-val ${aCls}">${animalPct}% / ${aGoal}%</div><div class="pl-total-flag ${aCls}">&nbsp;</div></div>
            </div>
            <div class="pl-cost-line">Estimated monthly cost: <strong class="${overBudget ? 'red' : ''}">${fmt(t.cost)}</strong> <span class="pln-note">/ ${fmt(goals.budget || 0)} ${overBudget ? '&mdash; over!' : ''}</span></div>
        </div>
        </aside>`;

// --- Builder ---
        const suggestionChips = S.ingredients.slice().sort((a, b) => (parseFloat(b.averagePrice) || 0) - (parseFloat(a.averagePrice) || 0)).slice(0, 8)
            .map(s => `<button type="button" class="pl-sugg-chip" data-name="${U.escapeHtml(s.name)}" data-foodid="${U.escapeHtml(s.foodId)}">${U.escapeHtml(s.name)}</button>`).join('');
        const rows = (S.planner.items || []).map((it, i) => {
            const ing = findIng(it.ingredientId);
            const c = perGramOf(ing) * gramsOf(it);
            const scopeOn = it.scope === 'month';
return `<div class="pl-item" data-idx="${i}">
                <div class="pl-item-name" title="${U.escapeHtml(ing ? ing.name : (it.name || '?'))}">${U.escapeHtml(ing ? ing.name : (it.name || '?'))}</div>
                <div class="pl-item-amount"><label class="pl-amount-label"><input type="number" class="pl-amount seamless-input" data-idx="${i}" value="${it.amount || ''}" step="any" min="0" style="width:64px;"></label>${unitSelect(it.unit, { cls: 'pl-unit sel-unit seamless-select', data: `data-idx="${i}"` })}</div>
                <div class="pl-item-cost">${fmt(c)}</div>
                <label class="pln-check" title="Apply existing pantry/household stock so this stays off the shopping list"><input type="checkbox" class="pl-usesock" data-idx="${i}" ${it.useStock ? 'checked' : ''}><span>use stock</span></label>
                <label class="pln-check" title="Long-life staple bought once for the month; otherwise refreshed weekly"><input type="checkbox" class="pl-scope" data-idx="${i}" ${scopeOn ? 'checked' : ''}><span>month</span></label>
                <button class="pl-item-remove" data-idx="${i}" title="Remove">&times;</button>
            </div>`;
        }).join('');
        html += `
        <div class="planner-card">
            <div class="planner-card-head"><i data-lucide="plus-square" style="width:18px;height:18px;"></i> Build the ingredient list <span class="planner-hint"><span class="red-note">red</span> over target &middot; <span class="blue-note">blue</span> near target</span></div>
<div class="pl-add-row">
<div class="pl-picker">
                    <input class="seamless-input pl-ing-picker" id="pl-ing-name" placeholder="Search ingredient&hellip;" autocomplete="off">
                    <div class="pl-picker-results" id="pl-ing-results"></div>
                </div>
                <label class="pl-amount-label pl-new-amount-label"><input type="number" class="seamless-input pl-new-amount" id="pl-new-amount" placeholder="Qty" step="any" min="0" style="width:64px;"></label>
                ${unitSelect('g', { cls: 'pl-new-unit sel-unit seamless-select', id: 'pl-new-unit' })}
                <button class="btn primary" id="pl-add-btn">Add</button>
            </div>
            ${suggestionChips ? `<div class="pl-sugg">Suggestions: ${suggestionChips}</div>` : ''}
            <div class="pl-list">${rows || '<div class="empty-state">No planned items yet &mdash; add your month&apos;s groceries above.</div>'}</div>
            <div class="plorer-list-actions"><button class="btn primary" id="pl-generate-btn"><i data-lucide="shopping-basket"></i> Generate shopping list</button></div>
        </div>
        <div id="pl-generated" class="planner-card"></div>
        </div>
        ${projectedCard}
        </div>
        <div class="pl-modal-backdrop" id="pl-goals-modal">
            <div class="pl-modal">
                <div class="pl-modal-head">
                    <div class="pl-modal-title"><i data-lucide="target" style="width:18px;height:18px;"></i> Monthly Nutrition Goals</div>
                    <button type="button" class="pl-modal-close" id="pl-goals-close" aria-label="Close">&times;</button>
                </div>
                <p class="pl-modal-desc">Energy &amp; macros default from your eater profiles (automatically summed over 30 days). Adjust min&ndash;max boundaries for the month if you need to override them.</p>
                <div class="pl-modal-body">${goalCells}
                    <div class="planner-goals-sub">
                        <div class="pln-sub-item"><label>Protein from animal sources</label><input type="number" class="pln-goal-sub" data-goal="meatProteinPct" value="${goals.meatProteinPct || 0}" min="0" max="100" style="width:70px;text-align:right;"> %</div>
                    </div>
                </div>
                <div class="pl-modal-foot">
                    <button type="button" class="btn secondary" id="pl-goals-cancel" style="font-size:14px;">Cancel</button>
                    <button type="button" class="btn primary" id="planner-save-goals" style="font-size:14px;"><i data-lucide="save" style="width:15px;height:15px;"></i> Save goals</button>
                </div>
            </div>
        </div>
        </div>`;

        container.innerHTML = html;
        if (root.lucide) root.lucide.createIcons();

const saveGoalsFromDOM = () => {
            container.querySelectorAll('[data-goal]').forEach(el => {
                const key = el.dataset.goal;
                if (key === 'currency') S.planner.goals[key] = el.value || 'MUR';
                else S.planner.goals[key] = parseFloat(el.value) || 0;
            });
        };

        // Modal open / close
        const openGoalModal = () => {
            const m = container.querySelector('#pl-goals-modal');
            if (m) m.classList.add('open');
        };
        const closeGoalModal = () => {
            const m = container.querySelector('#pl-goals-modal');
            if (m) m.classList.remove('open');
        };
        const openBtn = container.querySelector('#planner-open-goals');
        if (openBtn) openBtn.addEventListener('click', openGoalModal);
        const closeBtn = container.querySelector('#pl-goals-close');
        if (closeBtn) closeBtn.addEventListener('click', closeGoalModal);
        const cancelBtn = container.querySelector('#pl-goals-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', closeGoalModal);

        // Save goals from the modal (re-renders so projected totals update).
        const saveGoalsBtn = container.querySelector('#planner-save-goals');
        if (saveGoalsBtn) saveGoalsBtn.addEventListener('click', async () => {
            saveGoalsFromDOM();
            await App.savePlanner();
            closeGoalModal();
            renderPlanner();
        });

        // Budget: saved automatically when the input loses focus / on Enter.
        const budgetInput = container.querySelector('.pl-budget-input');
        if (budgetInput) {
            const persistBudget = async () => {
                const val = parseFloat(budgetInput.value);
                S.planner.goals.budget = (val && val > 0) ? val : 0;
                await App.savePlanner();
                renderPlanner();
            };
            budgetInput.addEventListener('change', persistBudget);
            budgetInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); budgetInput.blur(); }
            });
        }

        const addBtn = container.querySelector('#pl-add-btn');
        if (addBtn) addBtn.addEventListener('click', () => {
            const nameEl = container.querySelector('#pl-ing-name');
            const amtEl = container.querySelector('#pl-new-amount');
            const unitEl = container.querySelector('#pl-new-unit');
            const name = (nameEl ? nameEl.value : '').trim();
            const pickedId = nameEl ? nameEl.dataset.foodId : '';
            const ing = (pickedId && S.ingredients.find(f => f.foodId === pickedId))
                || S.ingredients.find(f => f.name.toLowerCase() === name.toLowerCase());
            if (!ing) { alert('Choose an ingredient from the list.'); return; }
            S.planner.items.push({
                ingredientId: ing.foodId, name: ing.name,
                amount: parseFloat(amtEl && amtEl.value) || 0,
                unit: (unitEl && unitEl.value.trim()) || 'g',
                scope: /can|tinned|jar|frozen|oil|condiment|spice|grain|legume|pasta|rice|flour|sugar|honey|bean/i.test(ing.category || '') ? 'month' : 'fresh',
useStock: false
            });
            renderPlanner();
            App.savePlanner();
        });

        container.querySelectorAll('.pl-sugg-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const nameEl = container.querySelector('#pl-ing-name');
                const resultsEl = container.querySelector('#pl-ing-results');
                if (nameEl) { nameEl.value = chip.dataset.name; nameEl.dataset.foodId = chip.dataset.foodId || ''; }
                if (resultsEl) resultsEl.innerHTML = '';
            });
        });

        // --- Ingredient picker: live search over the catalogue ---
        const nameEl = container.querySelector('#pl-ing-name');
        const resultsEl = container.querySelector('#pl-ing-results');
        const plSearch = (query) => {
            const q = (query || '').trim().toLowerCase();
            const hay = S.ingredients.filter(f => f && f.name);
            let matches = q
                ? hay.filter(f => f.name.toLowerCase().includes(q) || (f.category || '').toLowerCase().includes(q))
                : hay;
            matches = matches.slice(0, 12);
            if (!resultsEl) return;
            if (!matches.length) { resultsEl.innerHTML = ''; return; }
            resultsEl.innerHTML = matches.map(f => `
                <button type="button" class="pl-picker-item" data-foodid="${U.escapeHtml(f.foodId)}" data-name="${U.escapeHtml(f.name)}">
                    <span class="pl-picker-item-name">${U.escapeHtml(f.name)}</span>
                    ${f.category ? `<span class="pl-picker-item-cat">${U.escapeHtml(f.category)}</span>` : ''}
                </button>`).join('');
            resultsEl.querySelectorAll('.pl-picker-item').forEach(btn => btn.addEventListener('click', () => {
                if (nameEl) { nameEl.value = btn.dataset.name; nameEl.dataset.foodId = btn.dataset.foodId; }
                if (resultsEl) resultsEl.innerHTML = '';
            }));
        };
        if (nameEl) {
            nameEl.addEventListener('input', () => { nameEl.dataset.foodId = ''; plSearch(nameEl.value); });
            nameEl.addEventListener('focus', () => plSearch(nameEl.value));
            nameEl.addEventListener('blur', () => setTimeout(() => { if (resultsEl) resultsEl.innerHTML = ''; }, 150));
            nameEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); container.querySelector('#pl-add-btn') && container.querySelector('#pl-add-btn').click(); }
                if (e.key === 'Escape' && resultsEl) resultsEl.innerHTML = '';
            });
        }

container.querySelectorAll('.pl-amount, .pl-unit').forEach(el => {
            el.addEventListener('change', () => {
                const i = parseInt(el.dataset.idx);
                if (S.planner.items[i]) {
                    if (el.classList.contains('pl-amount')) S.planner.items[i].amount = parseFloat(el.value) || 0;
                    else S.planner.items[i].unit = el.value.trim() || 'g';
                    renderPlanner();
                    App.savePlanner();
                }
            });
        });
        container.querySelectorAll('.pl-scope').forEach(el => el.addEventListener('change', () => {
            const i = parseInt(el.dataset.idx);
            if (S.planner.items[i]) { S.planner.items[i].scope = el.checked ? 'month' : 'fresh'; renderPlanner(); App.savePlanner(); }
        }));
        container.querySelectorAll('.pl-usesock').forEach(el => el.addEventListener('change', () => {
            const i = parseInt(el.dataset.idx);
            if (S.planner.items[i]) { S.planner.items[i].useStock = el.checked; renderPlanner(); App.savePlanner(); }
        }));
        container.querySelectorAll('.pl-item-remove').forEach(btn => btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.idx);
            if (S.planner.items[i]) { S.planner.items.splice(i, 1); renderPlanner(); App.savePlanner(); }
        }));

        const genBtn = container.querySelector('#pl-generate-btn');
        if (genBtn) genBtn.addEventListener('click', () => {
            saveGoalsFromDOM();
            // Generate the shopping list in the Shopping tab, with the monthly
            // planner already ticked as a source.
            S.pendingShoppingSources = ['planner', 'meals'];
const shoppingTab = document.querySelector('.cms-tab[data-tab="shopping"]');
            if (shoppingTab) App.activateTab(shoppingTab);
            else App.renderCMSList();
        });
    }


    root.CMSPlanner = { render: renderPlanner };
})(typeof self !== 'undefined' ? self : this);
