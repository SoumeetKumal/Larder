// Website layout smoke test (Phase 1, regression guard for GAP-01/02/03 rendering).
// Boots index.html + app.js in jsdom with stubbed fetch, opens a recipe that has
// prepSteps/prepTime, a `##` subsection and a linked-ingredient token — then asserts
// the prep section renders ABOVE the method steps, both inside the single
// `.recipe-instructions-col` grid column, and the token becomes an href link.
'use strict';
const { test } = require('node:test');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const RECIPES = [
    {
        id: '1',
        entryType: 'recipe',
        title: 'Tuna Tagliatelle',
        category: 'Seafood',
        time: '25 mins',
        description: 'Test recipe',
        prepTime: '15 mins',
        prepSteps: ['Finely dice the onion.', 'Boil the water.[[tagliatelle|Tagliatelle]]'],
        steps: ['## For the sauce', 'Saute the garlic.', 'Toss the pasta with the parsley.'],
        macros: { yield: '2', energy: '500 kCal', protein: '30 g', carbohydrate: '60 g', fat: '12 g' },
        ingredients: [
            { item: 'Tagliatelle', foodId: 'tagliatelle', metric: '200g', imperial: '' },
            { item: 'Parsley', metric: '', imperial: '2 tbsp' }
        ]
    },
    { id: 'tagliatelle', entryType: 'ingredient', foodId: 'tagliatelle', title: 'Tagliatelle', category: 'Pasta' }
];

function makeDom() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const dom = new JSDOM(html, {
        url: 'http://localhost:8000/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
    const { window } = dom;
    window.lucide = { createIcons: () => {} };
    window.alert = () => {};
    window.confirm = () => true;
    window.requestAnimationFrame = (cb) => cb();
    window.fetch = async (url) => {
        const u = String(url);
        if (u.includes('/api/recipes') || u.startsWith('data/recipes.json')) {
            return { ok: true, status: 200, json: async () => RECIPES };
        }
        if (u.includes('/api/ingredients') || u.startsWith('data/ingredients.json')) {
            return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => [] };
    };

    window.eval(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));
    return { dom, window };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitReady(window) {
    for (let i = 0; i < 50 && window.document.readyState !== 'complete'; i++) await sleep(5);
}

test('website recipe modal: prep above method in one column, token links, ## subsections', async () => {
    const { dom, window } = makeDom();
    const document = window.document;
    await waitReady(window);
    await sleep(30); // loadRecipes -> initUI -> renderGrid

    const card = document.querySelector('.recipe-card[data-id="1"]');
    assert.ok(card, 'recipe card rendered');
    card.click();
    await sleep(10);

    const body = document.querySelector('#modal-body');
    assert.ok(body, 'modal body built');
    assert.ok(document.getElementById('recipe-modal').classList.contains('active'), 'modal opens');

    // The instructions column is a single `.recipe-instructions-col` containing
    // both the prep section and the method — the grid bug pushed the method to a
    // separate row below, so guard on nesting + relative order.
    const gridBody = body.querySelector('.modal-body'); // nested grid container
    assert.ok(gridBody, 'recipe grid row exists');
    const instructionCols = gridBody.querySelectorAll('.recipe-instructions-col');
    assert.ok(instructionCols.length >= 2, 'stat + instructions columns present');
    const instructionsCol = Array.from(instructionCols).find(col => col.textContent.includes('Instructions'));
    assert.ok(instructionsCol, 'instructions column found');

    const pills = instructionsCol.querySelectorAll(':scope > .section-pill');
    assert.equal(pills.length, 1, 'Instructions is the single main heading');
    assert.ok(pills[0].textContent.includes('Instructions'), 'instructions is the main heading');

    const prepSub = instructionsCol.querySelector(':scope > .recipe-instructions-subsection');
    assert.ok(prepSub, 'prep renders as a sub-section of Instructions');
    const prepTitle = prepSub.querySelector('.recipe-subsection-title');
    assert.ok(prepTitle.textContent.includes('Prep'), 'prep sub-section is labelled');
    assert.ok(prepTitle.textContent.includes('15 mins'), 'prepTime chip shown in prep sub-section');

    // DOM order within the instructions column: Instructions pill -> Prep sub-section -> method.
    const colKids = Array.from(instructionsCol.children);
    const pillIdx = colKids.indexOf(pills[0]);
    const prepIdx = colKids.indexOf(prepSub);
    const firstStepIdx = colKids.findIndex(c => c.classList.contains('recipe-step'));
    assert.ok(pillIdx > -1 && pillIdx < prepIdx, 'Instructions heading comes first');
    assert.ok(prepIdx < firstStepIdx, 'Prep sub-section comes before method steps');

    // Grid order: ingredients column must come before the prep/method column.
    const ingredientsCol = gridBody.querySelector('#ingredients-wrapper');
    assert.ok(ingredientsCol, 'ingredients column present');
    const bodyChildren = Array.from(gridBody.children);
    assert.ok(bodyChildren.indexOf(ingredientsCol) < bodyChildren.indexOf(instructionsCol),
        'ingredients column precedes instructions column in the grid source order');

    // Numbering restarts under a ## header: prep numbers 1..2, method renumbers from 1.
    const prepNums = prepSub.querySelectorAll('.recipe-step .step-number');
    assert.equal(prepNums.length, 2, 'two prep steps');
    assert.equal(prepNums[0].textContent.trim(), '1');
    assert.equal(prepNums[1].textContent.trim(), '2');
    const methodNums = instructionsCol.querySelectorAll(':scope > .recipe-step .step-number');
    assert.equal(methodNums.length, 2, 'two method steps');
    assert.equal(methodNums[0].textContent.trim(), '1', 'method numbering restarts under ## header');
    assert.equal(methodNums[1].textContent.trim(), '2');

    const methodHeaders = instructionsCol.querySelectorAll('h4');
    assert.ok(Array.from(methodHeaders).some(h => h.textContent.trim() === 'For the sauce'), '## subsection header rendered');

    const links = instructionsCol.querySelectorAll('a.ingredient-link[target="_blank"]');
    assert.ok(links.length >= 1, 'ingredient token renders as a new-tab link');
    assert.equal(links[0].getAttribute('href'), 'ingredients.html?foodId=tagliatelle', 'token link resolves to foodId deep link');
});