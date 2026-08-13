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

    for (const f of ['calc.js', 'cms-utils.js', 'cms-state.js', 'cms-receipts.js', 'cms-planner.js', 'cms.js']) {
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
