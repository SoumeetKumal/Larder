// DOM smoke test for the CMS recipe editor (Phase 1 features).
// Loads cms.html into jsdom, boots the CMS modules with stubbed fetch/UI, then
// exercises: prep-work section, subsection buttons, ingredient links in steps,
// and the save payload. Run via `node --test` (part of `npm test`).
'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FAKE_INGREDIENTS = [
    { foodId: 'tagliatelle', name: 'Tagliatelle', category: 'Pasta', servingSizeG: 100, servingUnit: 'g', calories: 360, proteinG: 13, fatG: 2, carbsG: 72, averagePrice: 80, priceBasisAmount: 500, priceBasisUnit: 'g' },
    { foodId: 'salt', name: 'Salt', category: 'Spices', servingSizeG: 100, servingUnit: 'g', calories: 0, proteinG: 0, fatG: 0, carbsG: 0, averagePrice: 30 }
];

function makeDom() {
    const html = fs.readFileSync(path.join(ROOT, 'cms.html'), 'utf8');
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000/cms.html',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const { window } = dom;
    window.lucide = { createIcons: () => {} };
    window.alert = () => {};
    window.confirm = () => true;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);

    const putBodies = [];
    window.fetch = async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'PUT') putBodies.push({ url: String(url), body: opts.body ? JSON.parse(String(opts.body)) : null });
        const datasets = {
            '/api/recipes': [],
            '/api/ingredients': FAKE_INGREDIENTS,
            '/api/mealplans': [],
            '/api/pantry': [],
            '/api/pantry-items': [],
            '/api/shoppinglists': [],
            '/api/household': [],
            '/api/planner': { goals: {}, items: [] },
            '/api/receipts': [],
            '/api/settings': { profiles: [], shopping: { currency: 'MUR' }, preferences: {}, automation: {} },
            '/api/exercises': [],
            '/api/workout-templates': []
        };
        for (const [k, v] of Object.entries(datasets)) {
            if (String(url).startsWith(k)) return { ok: true, status: 200, json: async () => v };
        }
        return { ok: true, status: 200, json: async () => [] };
    };

    for (const f of ['calc.js', 'cms-utils.js', 'cms-state.js', 'cms-receipts.js', 'cms-planner.js', 'sync-client.js', 'cms.js']) {
        window.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    // jsdom fires DOMContentLoaded natively; wait for it (plus async loadData).
    return { dom, window, putBodies };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitReady(window) {
    for (let i = 0; i < 50 && window.document.readyState !== 'complete'; i++) await sleep(5);
}

test('recipe editor: prep section, subsections, ingredient links, save payload', async () => {
    const { dom, window, putBodies } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20); // let the async loadData settle

    // Phase 1 static structure present in the editor modal.
    assert.ok(document.getElementById('prep-steps-container'), 'prep steps container exists');
    assert.ok(document.getElementById('add-prep-step-btn'), 'add-prep-step button exists');
    assert.ok(document.getElementById('add-section-btn'), 'add-section button exists');
    assert.ok(document.getElementById('add-ing-group-btn'), 'add-ing-group button exists');

    // Open the editor for a brand-new recipe.
    document.getElementById('add-recipe-btn').click();
    const editorModal = document.getElementById('cms-editor-modal');
    assert.ok(editorModal.classList.contains('active'), 'editor modal opens');

    // Add a prep step and type into it.
    document.getElementById('add-prep-step-btn').click();
    let prepRows = document.querySelectorAll('#prep-steps-container .cms-step-row');
    assert.equal(prepRows.length, 1, 'one prep row added');
    const prepTextarea = prepRows[0].querySelector('textarea');
    prepTextarea.value = 'Finely dice the onion.';
    document.getElementById('prep-time-mins').value = '15';

    // A prep sub-section header under the Prep block.
    document.getElementById('add-prep-section-btn').click();
    const prepHeaderRow = document.querySelectorAll('#prep-steps-container .cms-step-row')[1];
    assert.ok(prepHeaderRow && !prepHeaderRow.querySelector('textarea'), 'prep section header row has no textarea');
    prepHeaderRow.querySelector('[data-field="step"]').value = 'Chop and prep';

    // Add a method step with an ingredient link.
    document.getElementById('add-step-btn').click();
    const stepRows = document.querySelectorAll('#steps-container .cms-step-row');
    assert.equal(stepRows.length, 1, 'one method row added');
    const methodTextarea = stepRows[0].querySelector('textarea');
    methodTextarea.value = 'Boil the water.';
    methodTextarea.setSelectionRange(methodTextarea.value.length, methodTextarea.value.length);

    // Open the link picker on the method step and pick Tagliatelle.
    stepRows[0].querySelector('.step-link').click();
    const picker = stepRows[0].querySelector('.cms-step-link-picker');
    assert.ok(picker.classList.contains('open'), 'link picker opens');
    const items = picker.querySelectorAll('.cms-step-link-item');
    assert.equal(items.length, 2, 'picker lists catalog ingredients');
    const tagliatelleItem = Array.from(items).find(el => el.dataset.foodId === 'tagliatelle');
    assert.ok(tagliatelleItem, 'tagliatelle offered');
    tagliatelleItem.click();
    assert.ok(methodTextarea.value.includes('[[tagliatelle|Tagliatelle]]'), 'token inserted at caret');
    assert.ok(!picker.classList.contains('open'), 'picker closes after pick');

    // Add a subsection header to the method.
    document.getElementById('add-section-btn').click();
    const headerRow = document.querySelectorAll('#steps-container .cms-step-row')[1];
    assert.ok(!headerRow.querySelector('textarea'), 'section header row has no textarea');
    headerRow.querySelector('[data-field="step"]').value = 'For the sauce';

    // Add an ingredient group header.
    document.getElementById('add-ing-group-btn').click();
    assert.equal(document.querySelectorAll('#ingredients-container .cms-ingredient-header-row').length, 1, 'ingredient group row added');
    document.querySelector('#ingredients-container .cms-ingredient-header-row [data-field="name"]').value = 'For the pasta';

    // Save and inspect the payload.
    document.getElementById('recipe-title').value = 'Tuna Tagliatelle';
    document.getElementById('recipe-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await sleep(30);

    const recipePut = putBodies.find(p => p.url === '/api/recipes');
    assert.ok(recipePut, 'recipes PUT sent');
    const saved = recipePut.body.find(r => r.title === 'Tuna Tagliatelle');
    assert.ok(saved, 'saved recipe present');
    assert.deepEqual(saved.prepSteps, ['Finely dice the onion.', '## Chop and prep'], 'prepSteps saved');
    assert.equal(saved.prepTime, '15 mins', 'prepTime saved');
    assert.ok(saved.steps.includes('Boil the water.[[tagliatelle|Tagliatelle]]'), 'linked step saved with token');
    assert.ok(saved.steps.includes('## For the sauce'), 'section header saved');
    assert.ok(saved.ingredients.some(i => i.item === '## For the pasta'), 'ingredient group saved');
    const ingNameInput = document.querySelector('#ingredients-container .cms-ingredient-row [data-field="name"]');
    ingNameInput.value = 'Brand New Ingredient';
    ingNameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    const createRow = document.querySelector('.cms-ing-create');
    assert.ok(createRow, '+ Create offered');
    createRow.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(50); // async createAndLink + saveIngredients
    const toast = document.querySelector('.cms-toast');
    assert.ok(toast, 'toast shown after inline create');
    assert.ok(toast.textContent.includes('Brand New Ingredient'), 'toast names the ingredient');
    const action = toast.querySelector('.cms-toast-action');
    assert.ok(action, 'toast has an action button');
    action.click();
    await sleep(80); // toast action jumps to Foods tab, then opens the food profile
    const foodTab = document.querySelector('.cms-tab[data-tab="food"]');
    assert.ok(foodTab && foodTab.classList.contains('active'), 'toast action switches to Foods tab');
    const ingCreated = putBodies.find(p => p.url === '/api/ingredients');
    assert.ok(ingCreated, 'ingredients PUT sent after inline create');
    assert.ok(ingCreated.body.some(f => f.name === 'Brand New Ingredient'), 'created ingredient persisted');
    dom.window.close();
});

test('monthly planner: live gap strip + gap-closing chips add to the plan', async () => {
    const { dom, window, putBodies } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20);

    document.querySelector('.cms-tab[data-tab="planner"]').click();
    await sleep(30);

    const container = document.getElementById('cms-recipe-list');
    assert.ok(container.querySelector('.pl-gap-strip'), 'gap strip rendered in the builder');
    assert.equal(container.querySelectorAll('.pl-gap-item').length, 4, 'one gap item per macro (energy/protein/carbs/fat)');
    const stripText = container.querySelector('.pl-gap-strip').textContent;
    assert.ok(/left|over/.test(stripText), 'strip text shows left/over state');

    // Empty plan → every macro shows the full month target as remaining; with
    // macro-rich ingredients the chips rank by gap fill and are clickable.
    const chips = container.querySelectorAll('.pl-sugg-chip');
    assert.ok(chips.length > 0, 'suggestion chips render when gaps exist');
    const chipName = chips[0].textContent.split('+')[0].trim();
    chips[0].click();
    await sleep(30);

    assert.equal(container.querySelectorAll('.pl-item').length, 1, 'clicking a chip adds one item to the plan');
    assert.ok(container.querySelector('.pl-item').textContent.includes(chipName), 'added item matches the clicked suggestion');
    const plannerPut = putBodies.find(p => p.url.startsWith('/api/planner'));
    assert.ok(plannerPut, 'planner PUT sent after chip add');
    assert.equal(plannerPut.body.items.length, 1, 'saved planner holds the suggested item');
    dom.window.close();
});

test('meal assign modal: live macro panel + quick-add chips open the picker', async () => {
    const { dom, window, putBodies } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20);

    document.querySelector('.cms-tab[data-tab="mealplan"]').click();
    await sleep(40);

    const slot = document.querySelector('.mp-slot');
    assert.ok(slot, 'meal plan slot rendered');
    slot.click();
    await sleep(20);

    const modal = document.getElementById('meal-assign-modal');
    assert.ok(modal.classList.contains('active'), 'assign modal opens');
    const panel = document.getElementById('meal-assign-macro-panel');
    assert.ok(panel, 'macro panel container exists');
    assert.notEqual(panel.style.display, 'none', 'macro panel visible with the default profile');
    assert.equal(panel.querySelectorAll('.mp-macro-row').length, 1, 'one row per eater');
    assert.ok(panel.querySelector('.mp-macro-rest-line'), 'rest-of-today line rendered');
    assert.ok(panel.querySelectorAll('.mp-macro-rest').length === 4, 'rest line covers the four macros');

    const sugg = panel.querySelector('.mp-macro-sugg');
    assert.ok(sugg, 'quick-add gap chip offered when targets are unmet');
    const sugName = sugg.textContent.split('+')[0].trim();
    sugg.click();
    await sleep(10);

    const picker = document.getElementById('meal-assign-picker');
    assert.equal(picker.style.display, 'block', 'picker opens for the suggested ingredient');
    assert.ok(picker.querySelector('.mp-picker-name').textContent.includes(sugName), 'picker preloaded with the suggested ingredient');
    dom.window.close();
});

test('household modal renders price-history sparkline from multiple dated observations', async () => {
    const { dom, window } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20);

    const item = {
        id: 'hh_soap',
        name: 'Soap',
        category: 'Toiletries',
        unitSize: 'bottle',
        currentStock: 2,
        avgDurationDays: 30,
        pricePerUnit: 135,
        currency: 'Rs',
        priceHistory: [
            { date: '2026-05-01', price: 120 },
            { date: '2026-06-01', price: 125 },
            { date: '2026-07-01', price: 135 }
        ]
    };
    window.CMSState.householdItems = [item];

    document.querySelector('.cms-tab[data-tab="household"]').click();
    await sleep(40);

    const card = document.querySelector('.vd-pantry-card[data-hhid="hh_soap"]');
    assert.ok(card, 'household card rendered for the seeded item');
    card.click();
    await sleep(20);

    const modal = document.getElementById('cms-household-modal');
    assert.ok(modal.classList.contains('active'), 'household editor modal opens');
    const hhHist = document.getElementById('household-price-history');
    assert.ok(hhHist, 'price-history container present');
    assert.ok(hhHist.querySelector('svg'), 'sparkline SVG rendered when >1 price observations exist');
    assert.ok(hhHist.querySelector('svg path'), 'sparkline path drawn');
    dom.window.close();
});

test('monthly planner: auto-suggest banner offers to load the last saved month', async () => {
    const { dom, window } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20);

    window.CMSState.planner = { goals: {}, items: [] };
    window.CMSState.plannerMonthTemplates = [
        { id: 'mt_1', name: 'March 2026', savedOn: '2026-03-25T10:00:00.000Z', goals: { budget: 5000 }, items: [{ ingredientId: 'tagliatelle', name: 'Tagliatelle', amount: 1000, unit: 'g', scope: 'month', useStock: false }] },
        { id: 'mt_0', name: 'February 2026', savedOn: '2026-02-20T10:00:00.000Z', goals: {}, items: [] }
    ];

    document.querySelector('.cms-tab[data-tab="planner"]').click();
    await sleep(40);

    const container = document.getElementById('cms-recipe-list');
    const banner = container.querySelector('.pl-suggest-banner');
    assert.ok(banner, 'auto-suggest banner rendered for an empty plan');
    assert.ok(banner.textContent.includes('March 2026'), 'banner names the most recently saved month');

    banner.querySelector('.pl-suggest-load').click();
    await sleep(30);

    assert.equal(container.querySelectorAll('.pl-item').length, 1, 'clicking load fills the plan from the saved month');
    assert.ok(container.querySelector('.pl-item').textContent.includes('Tagliatelle'), 'loaded item matches the saved month');

    // Re-render must not re-prompt once dismissed/loaded.
    document.querySelector('.cms-tab[data-tab="recipe"]').click();
    await sleep(10);
    document.querySelector('.cms-tab[data-tab="planner"]').click();
    await sleep(30);
    assert.ok(!container.querySelector('.pl-suggest-banner'), 'banner does not reappear after being handled');
    dom.window.close();
});

test('monthly planner: product picker pins a brand, prices the row and remembers the choice', async () => {
    const { dom, window, putBodies } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20);

    window.CMSState.pantryItems = [
        { pantryId: 'p_barilla', ingredientFoodId: 'tagliatelle', brand: 'Barilla', productName: 'Tagliatelle', packSize: 500, packUnit: 'g', price: 90, currency: 'MUR', quantity: 2, isTracked: true },
        { pantryId: 'p_granoro', ingredientFoodId: 'tagliatelle', brand: 'Granoro', productName: 'Tagliatelle', packSize: 500, packUnit: 'g', price: 60, currency: 'MUR', quantity: 1, isTracked: true }
    ];
    window.CMSState.productPrefs = [{ foodId: 'tagliatelle', pantryId: 'p_barilla', updatedAt: '2026-08-01T00:00:00.000Z' }];
    window.CMSState.planner = { goals: {}, items: [{ ingredientId: 'tagliatelle', name: 'Tagliatelle', amount: 1000, unit: 'g', scope: 'month', useStock: false }] };

    document.querySelector('.cms-tab[data-tab="planner"]').click();
    await sleep(40);

    const container = document.getElementById('cms-recipe-list');
    const row = container.querySelector('.pl-item');
    assert.ok(row, 'planner row rendered');
    const picker = row.querySelector('.pl-product-select');
    assert.ok(picker, 'product picker appears when the ingredient has tracked pantry items');
    assert.equal(picker.querySelectorAll('option').length, 3, 'option list = ingredient price + 2 brands');

    // Remembered product is preselected, so the row prices with Barilla.
    assert.equal(picker.value, 'p_barilla', 'remembered product preselected by default');
    assert.ok(row.querySelector('.pl-item-cost').textContent.includes('Rs180'), 'row cost uses Barilla 90/500g for 1000g (Rs180)');

    // Switch to Granoro → row reprices, item records the pick, prefs update.
    picker.value = 'p_granoro';
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(30);

    const updatedRow = container.querySelector('.pl-item');
    assert.ok(updatedRow.querySelector('.pl-item-cost').textContent.includes('Rs120'), 'row cost reprices to Granoro 60/500g (Rs120)');
    const plannerPut = putBodies.filter(p => p.url.startsWith('/api/planner'));
    const lastPlanner = plannerPut[plannerPut.length - 1];
    assert.equal(lastPlanner.body.items[0].pantryId, 'p_granoro', 'pinned pantryId persisted on the planner item');
    const prefPut = putBodies.find(p => p.url.startsWith('/api/product-prefs'));
    assert.ok(prefPut, 'product preference PUT sent after picking');
    assert.equal(prefPut.body.find(x => x.foodId === 'tagliatelle').pantryId, 'p_granoro', 'last-used product remembered in prefs');

    // Projected month cost line reflects the pinned brand too.
    const costLine = container.querySelector('.pl-cost-line');
    assert.ok(costLine.textContent.includes('Rs120'), 'projected month cost uses the pinned product price');
    dom.window.close();
});

test('stats tab: top purchased, most cooked recipes, and CPI overlay render', async () => {
    const { dom, window } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(20);

    window.CMSState.receipts = [
        { id: 'r1', date: '2026-08-01', total: 500, currency: 'MUR', items: [
            { name: 'Tagliatelle', foodId: 'tagliatelle', price: 120, qty: 2 },
            { name: 'Salt', foodId: 'salt', price: 30, qty: 1 }
        ] },
        { id: 'r2', date: '2026-08-05', total: 240, currency: 'MUR', items: [
            { name: 'Tagliatelle', foodId: 'tagliatelle', price: 120, qty: 2 }
        ] }
    ];
    window.CMSState.consumption = [
        { id: 'c1', date: '2026-08-02', recipeId: '1', recipeTitle: 'Tuna Tagliatelle', items: [] },
        { id: 'c2', date: '2026-08-04', recipeId: '1', recipeTitle: 'Tuna Tagliatelle', items: [] },
        { id: 'c3', date: '2026-08-06', recipeId: '2', recipeTitle: 'Salt Pasta', items: [] }
    ];
    window.CMSState.appSettings = { profiles: [], shopping: { currency: 'MUR' }, stats: { cpi: 5 } };

    document.querySelector('.cms-tab[data-tab="stats"]').click();
    await sleep(30);

    const container = document.getElementById('cms-recipe-list');
    const subheads = Array.from(container.querySelectorAll('.rc-subhead')).map(h => h.textContent);
    assert.ok(subheads.some(s => s.includes('Top purchased')), 'top purchased section present');
    assert.ok(subheads.some(s => s.includes('Most cooked')), 'most cooked section present');

    // Top purchased: Tagliatelle bought 4×, Salt 1×.
    const purchasedNames = Array.from(container.querySelectorAll('.rc-stores')).find(s => s.textContent.includes('Top purchased'))
        .querySelectorAll('.rc-store-name');
    assert.equal(purchasedNames[0].textContent, 'Tagliatelle', 'most-purchased item ranks first');
    assert.ok(purchasedNames[0].parentElement.textContent.includes('4\u00d7'), 'purchase count shown (4x)');

    // Most cooked: Tuna Tagliatelle cooked twice.
    const cookedBlock = Array.from(container.querySelectorAll('.rc-stores')).find(s => s.textContent.includes('Most cooked'));
    const cookedNames = cookedBlock.querySelectorAll('.rc-store-name');
    assert.equal(cookedNames[0].textContent, 'Tuna Tagliatelle', 'most-cooked recipe ranks first');
    assert.ok(cookedNames[0].parentElement.textContent.includes('2\u00d7'), 'cook count shown (2x)');

    // CPI overlay: input prefilled with 5 and comparison row rendered.
    const cpiInput = container.querySelector('#stats-cpi');
    assert.ok(cpiInput, 'national CPI input present');
    assert.equal(cpiInput.value, '5', 'CPI input prefilled from settings');
    const compareRow = Array.from(container.querySelectorAll('.rc-store-row')).find(r => r.textContent.includes('Household vs national CPI'));
    assert.ok(compareRow, 'household-vs-national CPI comparison row rendered');
    assert.ok(compareRow.textContent.includes('national 5.0%'), 'comparison shows the national CPI value');

    // Entering a new CPI persists to settings and re-renders.
    cpiInput.value = '7.5';
    cpiInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(30);
    assert.ok(container.querySelector('#stats-cpi'), 'stats re-rendered after saving CPI');
    dom.window.close();
});
