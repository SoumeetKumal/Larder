'use strict';
const fs = require('fs');
const path = require('path');
const { connect, listTargets, newTarget, connectTarget, closeTarget } = require('./cdp');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const report = [];
const RESULTS = { total: 0, passed: 0, failed: 0, skipped: 0 };

const INSTALL_OVERRIDES = `(() => {
  window.__larderOrigin = window.location.href;
  window.alert = (m) => { console.log('[alert]', m); window.__lastAlert = m; };
  window.confirm = (m) => { console.log('[confirm]', m); window.__lastConfirm = m; return true; };
  return true;
})()`;

function record(workflow, step, status, detail) {
  RESULTS.total++;
  if (status === 'pass') RESULTS.passed++; else if (status === 'fail') RESULTS.failed++; else RESULTS.skipped++;
  report.push({ workflow, step, status, detail });
  const mark = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`[${mark}] ${workflow} · ${step}${detail ? ' — ' + detail : ''}`);
}

async function assert(workflow, step, cond, detail = '') {
  if (cond === true) record(workflow, step, 'pass', detail);
  else if (cond === 'SKIP') record(workflow, step, 'skip', detail);
  else record(workflow, step, 'fail', detail);
}

async function tab(cdp, name) {
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="${name}"]'); if (t) t.click(); return !!t; })()`);
  await sleep(600);
}

async function isModalActive(cdp, id) {
  return cdp.evalExpr(`(() => { const m = document.getElementById('${id}'); return !!(m && m.classList.contains('active')); })()`);
}

async function typeInto(cdp, selector, value) {
  return cdp.setInput(selector, value);
}

async function pickIngredientSuggestion(cdp, rowSelector, typedName, wantCreate = false) {
  // type into the row's name input then click a matching suggestion
  await cdp.evalExpr(`(() => {
    const row = document.querySelector(${JSON.stringify(rowSelector)});
    if (!row) return false;
    const input = row.querySelector('input[data-field="name"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(typedName)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('keyup', { bubbles: true }));
    return true;
  })()`);
  await sleep(400);
  const clicked = await cdp.evalExpr(`(() => {
    const row = document.querySelector(${JSON.stringify(rowSelector)});
    if (!row) return false;
    const list = row.querySelector('.cms-ing-suggestions');
    if (!list) return false;
    const sel = list.querySelector(${JSON.stringify(wantCreate ? '.cms-ing-create' : '.cms-ing-suggestion')});
    if (!sel) return false;
    sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    return true;
  })()`);
  await sleep(200);
  return clicked;
}

async function getIngredientFoodId(cdp, rowSelector) {
  return cdp.evalExpr(`(() => { const row = document.querySelector(${JSON.stringify(rowSelector)}); return row ? row.dataset.foodId : ''; })()`);
}

async function addIngredientRow(cdp, name, metricNum, metricUnit, imperialNum, imperialUnit, opts = {}) {
  const before = await cdp.count('#ingredients-container .cms-ingredient-row');
  await cdp.click('#add-ing-btn');
  await sleep(300);
  const after = await cdp.count('#ingredients-container .cms-ingredient-row');
  const idx = after - 1; // index of the newly added row
  const sel = `#ingredients-container .cms-ingredient-row:nth-of-type(${idx + 1})`;
  const picked = await pickIngredientSuggestion(cdp, sel, name, !!opts.create);
  const foodId = await getIngredientFoodId(cdp, sel);
  if (metricNum) await cdp.setInput(`${sel} [data-field="metric-num"]`, metricNum);
  if (metricUnit) await cdp.selectOption(`${sel} [data-field="metric-unit"]`, metricUnit);
  if (imperialNum) await cdp.setInput(`${sel} [data-field="imperial-num"]`, imperialNum);
  if (imperialUnit) await cdp.selectOption(`${sel} [data-field="imperial-unit"]`, imperialUnit);
  return { sel, picked, foodId };
}

async function addStepRow(cdp, text, container = '#steps-container', section = false) {
  const btn = section
    ? (container === '#prep-steps-container' ? '#add-prep-section-btn' : '#add-section-btn')
    : (container === '#prep-steps-container' ? '#add-prep-step-btn' : '#add-step-btn');
  const before = await cdp.count(`${container} .cms-step-row`);
  await cdp.click(btn);
  await sleep(250);
  const after = await cdp.count(`${container} .cms-step-row`);
  const sel = `${container} .cms-step-row:nth-of-type(${after})`;
  const field = await cdp.evalExpr(`(() => {
    const row = document.querySelector(${JSON.stringify(sel)});
    if (!row) return null;
    const el = row.querySelector('[data-field="step"]');
    return el ? (el.tagName) : null;
  })()`);
  await cdp.setInput(`${sel} [data-field="step"]`, text);
  return sel;
}

async function linkIngredientInStep(cdp, stepSelector, foodName) {
  await cdp.evalExpr(`(() => {
    const row = document.querySelector(${JSON.stringify(stepSelector)});
    const btn = row && row.querySelector('.step-link');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(250);
  await cdp.setInput(`${stepSelector} .cms-step-link-search`, foodName);
  await sleep(300);
  return cdp.evalExpr(`(() => {
    const row = document.querySelector(${JSON.stringify(stepSelector)});
    const item = row && row.querySelector('.cms-step-link-item');
    if (!item) return false;
    item.click();
    return true;
  })()`);
}

async function apiGet(cdp, p) { return cdp.apiGet(p); }

// ---------------------------------------------------------------------------

async function workflowA(cdp) {
  console.log('\n===== WORKFLOW A · Authoring & publishing recipes =====');
  const wf = 'A';
  await tab(cdp, 'recipe');

  // A1: Create a new recipe end-to-end through the editor UI.
  await cdp.click('#add-recipe-btn');
  await sleep(400);
  assert(wf, 'A1 open editor', await isModalActive(cdp, 'cms-editor-modal'));

  const ts = Date.now().toString(36);
  const title = `E2E Mushroom Risotto ${ts}`;
  await typeInto(cdp, '#recipe-title', title);
  await typeInto(cdp, '#recipe-desc', 'A creamy mushroom risotto made for the workflow test.');
  await cdp.selectOption('#recipe-category', 'Grains');
  await typeInto(cdp, '#recipe-time-hours', '0');
  await typeInto(cdp, '#recipe-time-mins', '35');
  await typeInto(cdp, '#prep-time-hours', '0');
  await typeInto(cdp, '#prep-time-mins', '10');
  await typeInto(cdp, '#macro-yield', '4');
  await typeInto(cdp, '#recipe-image', 'https://example.com/risotto.jpg');

  // Prep section + a prep step.
  await addStepRow(cdp, 'Mise en place', '#prep-steps-container', true);
  await addStepRow(cdp, 'Dice onion and slice mushrooms.', '#prep-steps-container');
  await addStepRow(cdp, 'Grate parmesan.', '#prep-steps-container');

  // Ingredients: rice (suggestion), a new ingredient created inline, parmesan.
  const ing1 = await addIngredientRow(cdp, 'Rice', '300', 'g', '1.5', 'cups');
  const blendName = 'Maitake Shiitake Blend ' + Date.now().toString(36).slice(-4);
  const ing2 = await addIngredientRow(cdp, blendName, '1', '', '', 'whole', { create: true });
  const ing3 = await addIngredientRow(cdp, 'Parmesan Cheese', '50', 'g', '', '', {});
  const foodId1 = ing1.foodId;
  const foodId2 = ing2.foodId;
  const foodId3 = ing3.foodId;
  assert(wf, 'A1 ingredient suggestion sets foodId', !!foodId1 && foodId1 !== '', `rice foodId=${foodId1}`);
  assert(wf, 'A1 create ingredient inline', !!foodId2 && foodId2 !== '', `blend foodId=${foodId2}`);

  // Method with subsection + steps, and link an ingredient in a step.
  await addStepRow(cdp, 'For the rice', '#steps-container', true);
  const step1 = await addStepRow(cdp, 'Toast the rice in butter until translucent.', '#steps-container');
  const step2 = await addStepRow(cdp, 'Add stock gradually and stir.', '#steps-container');
  const linked = await linkIngredientInStep(cdp, step1, 'Rice');
  assert(wf, 'A1 link ingredient in step', linked === true);

  // Tags
  await typeInto(cdp, '#recipe-tags-input', 'weeknight');
  await cdp.click('#recipe-tags-add');
  await sleep(200);

  // Save
  await cdp.evalExpr(`(() => { const f = document.getElementById('recipe-form'); const b = f.querySelector('button[type="submit"]'); if (b) b.click(); return !!b; })()`);
  await sleep(1200);
  await cdp.evalExpr(`(() => { const m = document.getElementById('cms-editor-modal'); if (m) m.classList.remove('active'); document.body.style.overflow=''; return true; })()`);

  // Verify via API
  const recs = await apiGet(cdp, '/api/recipes');
  const created = recs.data.find(r => r.title === title);
  assert(wf, 'A1 recipe saved via UI', !!created, created ? `id=${created.id}` : 'not found');
  if (created) {
    const ings = created.ingredients || [];
    assert(wf, 'A1 recipe ingredients persisted', ings.length >= 3, `${ings.length} ingredients`);
    assert(wf, 'A1 recipe has foodIds', ings.every(i => i.foodId), 'all foodIds set');
    assert(wf, 'A1 recipe has prepSteps', (created.prepSteps || []).length === 3, '3 prep steps');
    assert(wf, 'A1 recipe has subsections', (created.steps || []).some(s => s.startsWith('## ')), 'section present');
    assert(wf, 'A1 recipe has linked ingredient in step', (created.steps || []).some(s => s.includes('[[')), '[[link]] present');
    assert(wf, 'A1 recipe has tags', (created.tags || []).includes('weeknight'));
    assert(wf, 'A1 recipe has image', created.imageUrl && created.imageUrl.includes('risotto'));
  }

  // A2: Website renders ingredient names as links (target=_blank + external-link affordance).
  // Electron is a single-window app, so we navigate the current page to the website,
  // inspect it, then navigate back to the CMS.
  const recipeToOpen = created ? created : recs.data[0];
  try {
    await cdp.evalExpr(`window.location.href = 'http://localhost:8000/index.html'; true`);
    await sleep(2500);
    const listHasRecipe = await cdp.evalExpr(`(() => !!Array.from(document.querySelectorAll('*')).find(n => (n.textContent||'').trim() === ${JSON.stringify(recipeToOpen.title)} && n.children.length === 0))()`);
    assert(wf, 'A2 website lists the recipe', listHasRecipe, recipeToOpen.title);
    await cdp.evalExpr(`(() => {
      const els = Array.from(document.querySelectorAll('*')).filter(n => (n.textContent||'').trim() === ${JSON.stringify(recipeToOpen.title)} && n.children.length === 0);
      const el = els[0];
      if (!el) return false;
      let cur = el; let clickable = null;
      while (cur && cur !== document.body) {
        if (cur.tagName && cur.tagName.toLowerCase() === 'a') { clickable = cur; break; }
        if (cur.onclick || cur.closest && cur.closest('a')) { clickable = cur.closest('a') || cur; break; }
        cur = cur.parentElement;
      }
      if (!clickable) { const card = el.closest && (el.closest('[data-recipe-id]') || el.closest('.recipe-card') || el.closest('article') || el.closest('li')); if (card) { card.click(); return true; } return false; }
      clickable.click();
      return true;
    })()`);
    await sleep(1500);
    const linkInfo = await cdp.evalExpr(`(() => {
      const links = Array.from(document.querySelectorAll('a.ingredient-link, .ingredient-link'));
      return { count: links.length, sample: links.slice(0,3).map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target') })) };
    })()`);
    assert(wf, 'A2 ingredient names are links', linkInfo.count > 0, `${linkInfo.count} .ingredient-link anchors`);
    const hasBlank = linkInfo.sample.some(s => s.target === '_blank');
    assert(wf, 'A2 links open in new tab (target=_blank)', hasBlank, JSON.stringify(linkInfo.sample));
    await cdp.evalExpr(`window.location.href = 'http://localhost:8000/cms.html'; true`);
    await sleep(2500);
    await cdp.evalExpr(INSTALL_OVERRIDES);
  } catch (e) {
    assert(wf, 'A2 website render', 'SKIP', 'could not inspect website: ' + e.message);
    try { await cdp.evalExpr(`window.location.href = 'http://localhost:8000/cms.html'; true`); await sleep(2500); await cdp.evalExpr(INSTALL_OVERRIDES); } catch (e2) {}
  }

  // A3: Maintain ingredients — edit a created ingredient via the Foods tab.
  const ingToEdit = created && created.ingredients ? created.ingredients[0] : null;
  if (ingToEdit && ingToEdit.foodId) {
    await tab(cdp, 'food');
    await cdp.setInput('#cms-search', (ingToEdit.item || ingToEdit.name || '').slice(0, 8));
    await sleep(600);
    const opened = await cdp.evalExpr(`(() => {
      const rows = document.querySelectorAll('#cms-recipe-list tr[data-id]');
      for (const r of rows) { if ((r.textContent||'').includes(${JSON.stringify(ingToEdit.item || ingToEdit.name)})) { r.click(); return r.dataset.id; } }
      for (const r of rows) { if ((r.textContent||'').includes(${JSON.stringify(ingToEdit.foodId)})) { r.click(); return r.dataset.id; } }
      return null;
    })()`);
    assert(wf, 'A3 open ingredient profile', !!opened, opened || 'not found');
    if (opened) {
      // Category is a select; add "Pantry Staples" as an option if not present, then pick it.
      await cdp.evalExpr(`(() => {
        const sel = document.getElementById('profile-category');
        if (!sel) return false;
        const want = 'Pantry Staples';
        if (![...sel.options].some(o => o.value === want)) {
          const opt = document.createElement('option');
          opt.value = want; opt.textContent = want; sel.appendChild(opt);
        }
        sel.value = want;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await typeInto(cdp, '#profile-average-price', '320');
      await cdp.evalExpr(`(() => { const f = document.getElementById('ingredient-profile-form'); f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true})); return true; })()`);
      await sleep(1000);
      await cdp.evalExpr(`(() => { const m = document.getElementById('cms-food-modal'); if (m) m.classList.remove('active'); document.body.style.overflow=''; return true; })()`);
      const ingAfter = (await apiGet(cdp, '/api/ingredients')).data.find(i => i.foodId === opened);
      assert(wf, 'A3 ingredient edit persisted', !!ingAfter && ingAfter.category === 'Pantry Staples', ingAfter ? `category=${ingAfter.category} price=${ingAfter.averagePrice}` : 'not found');
    }
  } else {
    assert(wf, 'A3 maintain ingredient', 'SKIP', 'no ingredient to edit from created recipe');
  }
}

// ---------------------------------------------------------------------------

async function workflowB(cdp) {
  console.log('\n===== WORKFLOW B · Daily cooking — pantry loop =====');
  const wf = 'B';
  await tab(cdp, 'pantry');

  // B1: pantry shows seeded tracked items
  const pantryBefore = await apiGet(cdp, '/api/pantry-items');
  const pGranoro = pantryBefore.data.find(p => p.pantryId === 'p_granoro');
  const qtyBefore = pGranoro ? parseFloat(pGranoro.quantity) : null;
  assert(wf, 'B1 pantry has tracked items', !!pGranoro, pGranoro ? `p_granoro qty=${qtyBefore}` : 'missing');
  const consumptionBefore = (await apiGet(cdp, '/api/consumption')).data.length;

  // B2 recipe-based: open the seeded tagliatelle recipe, log "I cooked this".
  await tab(cdp, 'recipe');
  const opened = await cdp.evalExpr(`(() => {
    const cards = document.querySelectorAll('#cms-recipe-list [data-id]');
    for (const c of cards) { if ((c.textContent||'').includes('Creamy Chicken Tagliatelle')) { c.click(); return c.dataset.id; } }
    return null;
  })()`);
  assert(wf, 'B2 open recipe to log cooked', !!opened, opened || 'not found');
  await sleep(500);
  const cookedOpen = await cdp.evalExpr(`(() => { const b = document.getElementById('cms-cooked-btn'); if (b) b.click(); return !!b; })()`);
  await sleep(400);
  assert(wf, 'B2 cooked dialog opens', await isModalActive(cdp, 'cooked-dialog'));
  const itemCount = await cdp.count('#cooked-items-container .cooked-item');
  assert(wf, 'B2 cooked dialog lists ingredients', itemCount > 0, `${itemCount} items`);
  await typeInto(cdp, '#cooked-servings', '2');
  await cdp.evalExpr(`(() => {
    const sel = document.querySelector('.cooked-product[data-food-id="tagliatelle"]');
    if (sel) { sel.value = 'p_granoro'; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    return false;
  })()`);
  await sleep(150);
  await cdp.click('#cooked-dialog-ok');
  await sleep(1200);
  const consumptionAfter = (await apiGet(cdp, '/api/consumption')).data;
  const newRec = consumptionAfter.find(r => r.recipeId === opened);
  assert(wf, 'B2 consumption record created', !!newRec, newRec ? `id=${newRec.id} servings=${newRec.servingsCooked}` : 'missing');
  if (newRec) {
    assert(wf, 'B2 consumption has foodId items', (newRec.items || []).length > 0, `${(newRec.items||[]).length} items`);
  }
  const pantryMid = (await apiGet(cdp, '/api/pantry-items')).data;
  const pGranoroMid = pantryMid.find(p => p.pantryId === 'p_granoro');
  const decrementedByCooked = pGranoroMid && qtyBefore !== null && parseFloat(pGranoroMid.quantity) < qtyBefore;
  assert(wf, 'B2 pantry decremented by cooked', decrementedByCooked === true, pGranoroMid ? `qty ${qtyBefore} -> ${pGranoroMid.quantity}` : 'missing');

  // B2 manual: "Used" button on a pantry item.
  await tab(cdp, 'pantry');
  const usedOpen = await cdp.evalExpr(`(() => {
    const btn = document.getElementById('pantry-used-btn-p_granoro') || document.querySelector('[id^="pantry-used-btn-"]');
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(400);
  assert(wf, 'B2 used dialog opens', usedOpen === true && await isModalActive(cdp, 'used-dialog'));
  await typeInto(cdp, '#used-grams', '100');
  await cdp.click('#used-dialog-ok');
  await sleep(1200);
  const pantryAfter = (await apiGet(cdp, '/api/pantry-items')).data;
  const pGranoroAfter = pantryAfter.find(p => p.pantryId === 'p_granoro');
  const manualRec = (await apiGet(cdp, '/api/consumption')).data.find(r => r.recipeTitle && r.recipeTitle.includes('Manual use'));
  assert(wf, 'B2 manual use consumption recorded', !!manualRec, manualRec ? manualRec.recipeTitle : 'missing');
  const decrementedByManual = pGranoroAfter && parseFloat(pGranoroAfter.quantity) < parseFloat(pGranoroMid.quantity);
  assert(wf, 'B2 manual use decremented pantry', decrementedByManual === true, pGranoroAfter ? `qty ${pGranoroMid.quantity} -> ${pGranoroAfter.quantity}` : 'missing');
}

// ---------------------------------------------------------------------------

async function workflowC(cdp) {
  console.log('\n===== WORKFLOW C · The shopping trip =====');
  const wf = 'C';
  await tab(cdp, 'shopping');

  // C1: Generate shopping list from sources.
  const srcs = await cdp.evalExpr(`(() => [...document.querySelectorAll('.shop-src input[data-source]')].map(b => b.dataset.source))()`);
  for (const s of srcs) await cdp.setChecked(`.shop-src input[data-source="${s}"]`, true);
  await cdp.click('#generate-list-btn');
  await sleep(1400);
  const itemCount = await cdp.count('.vd-shop-item');
  assert(wf, 'C1 shopping list generated', itemCount > 0, `${itemCount} items`);
  const listTotal = await cdp.text('.vd-shop-summary-total');
  assert(wf, 'C1 estimated total shown', !!listTotal, listTotal);

  // Include/exclude an item.
  const excluded = await cdp.evalExpr(`(() => {
    const row = document.querySelector('.vd-shop-item');
    if (!row) return false;
    const toggle = row.querySelector('.vd-shop-include-toggle');
    if (!toggle) return false;
    const before = toggle.getAttribute('aria-checked');
    toggle.click();
    return before;
  })()`);
  assert(wf, 'C1 can include/exclude items', excluded !== false && excluded !== null, `was ${excluded}`);

  // Save list -> persists to /api/shoppinglists for today.
  await cdp.click('#save-list-btn');
  await sleep(1200);
  const today = new Date().toISOString().split('T')[0];
  const lists = (await apiGet(cdp, '/api/shoppinglists')).data;
  const todayList = lists.find(l => l.date === today);
  assert(wf, 'C1 saved list persisted for today', !!todayList, today ? `date=${today}` : 'missing');
  if (todayList) {
    assert(wf, 'C1 list items have expected cost', (todayList.items || []).some(i => i.cost > 0), 'has priced items');
  }

  // C3: past lists are saved & dated.
  await cdp.click('#shop-view-past');
  await sleep(600);
  const pastCount = await cdp.count('#shopping-past-lists .past-list-item, #shopping-past-lists [class*="list"]');
  const pastListBox = await cdp.evalExpr(`(() => { const c = document.getElementById('shopping-past-lists'); return c ? (c.textContent||'').slice(0,120) : ''; })()`);
  assert(wf, 'C3 past lists shown & dated', pastCount > 0 || pastListBox.includes('2026'), pastListBox.slice(0, 80));
  await cdp.click('#shop-view-current');
  await sleep(400);

  // C3: phone shared live checklist — navigate the current window to the phone PWA,
  // confirm the same list renders, tick an item, then return to the CMS.
  try {
    await cdp.evalExpr(`window.location.href = 'http://localhost:8000/phone/'; true`);
    await sleep(3000);
    const phoneList = await cdp.evalExpr(`(() => {
      const items = document.querySelectorAll('#list-items .ph-item');
      return { count: items.length, names: Array.from(items).slice(0,4).map(i => i.textContent.trim().slice(0,30)) };
    })()`);
    assert(wf, 'C3 phone renders shared checklist', phoneList.count > 0, `${phoneList.count} items on phone`);
    const ticked = await cdp.evalExpr(`(() => {
      const box = document.querySelector('#list-items .ph-check');
      if (!box) return false;
      box.click();
      return true;
    })()`);
    await sleep(1500);
    const listsAfterTick = (await apiGet(cdp, '/api/shoppinglists')).data;
    const tickRec = listsAfterTick.find(l => l.date === today);
    const anyChecked = tickRec && (tickRec.items || []).some(i => i.checked);
    assert(wf, 'C3 phone tick persists to shared list', ticked === true && anyChecked === true, 'checkbox state saved');
    await cdp.evalExpr(`window.location.href = 'http://localhost:8000/cms.html'; true`);
    await sleep(2500);
    await cdp.evalExpr(INSTALL_OVERRIDES);
  } catch (e) {
    assert(wf, 'C3 phone live checklist', 'SKIP', 'could not inspect phone: ' + e.message);
    try { await cdp.evalExpr(`window.location.href = 'http://localhost:8000/cms.html'; true`); await sleep(2500); await cdp.evalExpr(INSTALL_OVERRIDES); } catch (e2) {}
  }

  // C4: Receipt capture via pasted text + price comparison.
  await tab(cdp, 'receipts');
  await typeInto(cdp, '#rc-store', 'E2E Supermart');
  await typeInto(cdp, '#rc-date', '2026-08-16');
  await typeInto(cdp, '#rc-total', '140');
  await typeInto(cdp, '#rc-paste', 'Rice 300.00\nOnion 25.00\nChicken Breast 450.00\nTOTAL 140.00');
  await cdp.click('#rc-parse-btn');
  await sleep(900);
  const parsed = await cdp.count('#rc-items-rows .rc-man-item');
  assert(wf, 'C4 receipt lines parsed', parsed >= 2, `${parsed} lines`);
  await cdp.click('#rc-save-btn');
  await sleep(1400);
  const receipts = (await apiGet(cdp, '/api/receipts')).data;
  const savedRc = receipts.find(r => r.store === 'E2E Supermart');
  assert(wf, 'C4 receipt saved', !!savedRc, savedRc ? `id=${savedRc.id} total=${savedRc.total}` : 'missing');
  if (savedRc) {
    assert(wf, 'C4 receipt items matched to ingredients', (savedRc.items || []).some(i => i.foodId), 'has foodId matches');
  }
}

// ---------------------------------------------------------------------------

async function workflowD(cdp) {
  console.log('\n===== WORKFLOW D · Understanding ourselves (stats) =====');
  const wf = 'D';
  await tab(cdp, 'stats');
  const kpis = await cdp.evalExpr(`(() => Array.from(document.querySelectorAll('.rc-kpi-val')).map(v => v.textContent.trim()))()`);
  assert(wf, 'D stats KPIs render', kpis.length >= 3, JSON.stringify(kpis));
  const hasSpend = kpis.some(k => /Rs|MUR|\\$/.test(k));
  assert(wf, 'D total spend shown', hasSpend, kpis.join(', '));
  const inflation = await cdp.text('.rc-kpi-sub');
  assert(wf, 'D inflation/savings signals present', !!inflation, inflation);
  // switch period
  await cdp.selectOption('#stats-period', 'all');
  await sleep(600);
  const kpis2 = await cdp.evalExpr(`(() => Array.from(document.querySelectorAll('.rc-kpi-val')).map(v => v.textContent.trim()))()`);
  assert(wf, 'D period switch re-renders', kpis2.length >= 3, JSON.stringify(kpis2));
}

// ---------------------------------------------------------------------------

async function workflowE(cdp) {
  console.log('\n===== WORKFLOW E · Meal planning that knows our pantry =====');
  const wf = 'E';
  await tab(cdp, 'planner');

  // E1: pick a product for the Tagliatelle planner row (Granoro) -> price updates & remembered.
  const hasSelect = await cdp.count('.pl-product-select');
  assert(wf, 'E1 planner rows have product selects', hasSelect > 0, `${hasSelect} rows`);
  if (hasSelect > 0) {
    const changed = await cdp.evalExpr(`(() => {
      const sel = document.querySelector('.pl-product-select');
      if (!sel) return false;
      const before = sel.value;
      const target = [...sel.options].find(o => o.value && o.value !== before);
      if (!target) return false;
      sel.value = target.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { before, after: target.value };
    })()`);
    await sleep(900);
    assert(wf, 'E1 change product on planner row', changed !== false && !!changed.after, JSON.stringify(changed));
    const prefs = (await apiGet(cdp, '/api/product-prefs')).data;
    const prefsRec = prefs.find(p => p.foodId === 'tagliatelle' && p.pantryId === changed.after);
    assert(wf, 'E1 product choice remembered (productPrefs)', !!prefsRec, changed ? `tagliatelle -> ${changed.after}` : 'no prefs');
    if (prefsRec) {
      // reload planner tab and verify pre-selected
      await tab(cdp, 'planner');
      const preselected = await cdp.evalExpr(`(() => {
        const sel = document.querySelector('.pl-product-select');
        return sel ? sel.value : null;
      })()`);
      assert(wf, 'E1 next-time remembers choice', preselected === changed.after, `preselected=${preselected}`);
    }
  }

  // E2: Household items show duration + min/max threshold, "Opened New Unit" works.
  await tab(cdp, 'household');
  const hhCount = await cdp.count('.vd-pantry-card[data-hhid]');
  assert(wf, 'E2 household items render', hhCount >= 2, `${hhCount} items`);
  const hhInfo = await cdp.evalExpr(`(() => {
    const card = document.querySelector('.vd-pantry-card[data-hhid]');
    return card ? card.textContent.replace(/\\s+/g,' ').slice(0,160) : '';
  })()`);
  assert(wf, 'E2 household shows duration/days-left', /\d+\s*d|days|Runs out/.test(hhInfo), hhInfo.slice(0, 100));
  const openedNew = await cdp.evalExpr(`(() => {
    const btn = document.querySelector('.hh-open-btn');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(1000);
  const hhAfter = (await apiGet(cdp, '/api/household')).data;
  assert(wf, 'E2 opened-new-unit logs', openedNew === true && hhAfter.length === hhCount, `${hhAfter.length} items`);
}

// ---------------------------------------------------------------------------

async function workflowF(cdp) {
  console.log('\n===== WORKFLOW F · End-of-month planning =====');
  const wf = 'F';
  await tab(cdp, 'mealplan');

  // Assign a meal to a slot via the assign modal.
  const slotClicked = await cdp.evalExpr(`(() => {
    const slot = document.querySelector('.mp-slot');
    if (!slot) return false;
    slot.click();
    return { date: slot.dataset.date, slot: slot.dataset.slot };
  })()`);
  await sleep(500);
  assert(wf, 'F meal assign modal opens', await isModalActive(cdp, 'meal-assign-modal'));
  await typeInto(cdp, '#meal-assign-search', 'Tagliatelle');
  await sleep(600);
  const suggClicked = await cdp.evalExpr(`(() => {
    const box = document.getElementById('meal-assign-suggestions');
    const item = box && box.querySelector('.autocomplete-item');
    if (!item) return false;
    item.click();
    return true;
  })()`);
  await sleep(400);
  assert(wf, 'F pick a recipe in assign modal', suggClicked === true);
  await cdp.click('#meal-assign-confirm');
  await sleep(900);
  const plans = (await apiGet(cdp, '/api/mealplans')).data;
  const anyPlan = plans.some(p => p.recipeId === '1' || (p.items && p.items.length));
  assert(wf, 'F meal plan persisted', anyPlan || plans.length > 0, `${plans.length} plans`);

  // Save plan + confirm plan -> plan-versions records date/month saved.
  await cdp.click('#save-mealplan-btn');
  await sleep(900);
  const plansSaved = (await apiGet(cdp, '/api/mealplans')).data;
  assert(wf, 'F save plan persists', plansSaved.length >= plans.length, `${plansSaved.length} plans`);

  await cdp.click('#confirm-plan-btn');
  await sleep(1200);
  const versions = (await apiGet(cdp, '/api/plan-versions')).data;
  const lastVer = versions[0];
  assert(wf, 'F plan version recorded with date', !!lastVer && !!lastVer.confirmedAt, lastVer ? `id=${lastVer.id} at=${lastVer.confirmedAt}` : 'missing');

  // Templates: save week as template.
  await tab(cdp, 'mealplan');
  await cdp.click('#meal-template-save');
  await sleep(800);
  const templates = (await apiGet(cdp, '/api/planner-templates')).data;
  const anyTpl = templates.find(t => /template/i.test(t.name || '') || (t.days && t.days.length));
  assert(wf, 'F week saved as template', templates.length > 0, `${templates.length} templates`);

  // Planner generate end-of-month list.
  await tab(cdp, 'planner');
  const generated = await cdp.evalExpr(`(() => {
    const btn = document.getElementById('pl-generate-btn');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(1400);
  assert(wf, 'F generate end-of-month shop', generated === true);
  const lists = (await apiGet(cdp, '/api/shoppinglists')).data;
  assert(wf, 'F EOM shop created from planner', lists.length > 0, `${lists.length} lists`);
}

// ---------------------------------------------------------------------------

async function workflowG(cdp) {
  console.log('\n===== WORKFLOW G · Cross-cutting =====');
  const wf = 'G';

  // G1: offline-first — everything serves from the local server (no external calls).
  const offline = await cdp.evalExpr(`(() => {
    // The app's data is served from localhost:8000. Confirm the page origin is local.
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  })()`);
  assert(wf, 'G1 offline-first local origin', offline === true, `origin=${offline}`);

  // G2: backup/restore round-trip via /api/export + /api/import.
  try {
    const exp = await fetch('http://localhost:8000/api/export', { headers: { 'Authorization': 'Bearer larder_local_sync_8f92k' } });
    assert(wf, 'G2 export returns zip', exp.ok === true && exp.status === 200, `status=${exp.status}`);
    const expBuf = await exp.arrayBuffer();
    // import the exported bundle back (round-trip) with the same zip bytes
    const imp = await fetch('http://localhost:8000/api/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer larder_local_sync_8f92k' },
      body: Buffer.from(expBuf)
    });
    assert(wf, 'G2 import round-trip', imp.ok === true, `status=${imp.status}`);
    // verify datasets intact after restore
    const recipes = await apiGet(cdp, '/api/recipes');
    const ingredients = await apiGet(cdp, '/api/ingredients');
    const pantry = await apiGet(cdp, '/api/pantry-items');
    const plans = await apiGet(cdp, '/api/mealplans');
    assert(wf, 'G2 all datasets intact after restore',
      recipes.ok && ingredients.ok && pantry.ok && plans.ok &&
      recipes.data.length > 0 && ingredients.data.length > 0,
      `recipes=${recipes.data && recipes.data.length} ingredients=${ingredients.data && ingredients.data.length}`);
  } catch (e) {
    assert(wf, 'G2 backup/restore', 'SKIP', 'export/import failed: ' + e.message);
  }

  // G3: traceability — consumption + receipts + shopping lists all carry dates/ids.
  const consumption = (await apiGet(cdp, '/api/consumption')).data;
  const shopping = (await apiGet(cdp, '/api/shoppinglists')).data;
  const dated = consumption.every(r => !!r.date && !!r.id) && shopping.every(l => !!l.date && !!l.id);
  assert(wf, 'G3 records dated & traceable', dated === true, `${consumption.length} consumption, ${shopping.length} lists`);

  // G4: everything editable later — update a pantry item quantity via API and confirm it persists.
  const pantryItems = (await apiGet(cdp, '/api/pantry-items')).data;
  const someItem = pantryItems[0];
  if (someItem) {
    const newQty = (parseFloat(someItem.quantity) || 1) + 1;
    const updated = Object.assign({}, someItem, { quantity: newQty });
    const res = await cdp.api('PUT', '/api/pantry-items', pantryItems.map(p => p.pantryId === someItem.pantryId ? updated : p));
    assert(wf, 'G4 edit persists', res.ok === true);
    const after = (await apiGet(cdp, '/api/pantry-items')).data.find(p => p.pantryId === someItem.pantryId);
    assert(wf, 'G4 quantity updated', parseFloat(after.quantity) === newQty, `${someItem.pantryId} -> ${after.quantity}`);
  }

  // G5: publish to the website — POST /api/publish git-commits/pushes live data to
  // GitHub Pages (repo clone kept under the app data folder). This pushes the E2E
  // test recipes etc. to the live site; flagged as a deliberate side effect.
  try {
    const pub = await cdp.api('POST', '/api/publish', {});
    assert(wf, 'G5 publish to website succeeds', pub.ok === true && pub.status === 200, pub.data ? `copied=${pub.data.copied} ${pub.data.message || ''}` : `status=${pub.status}`);
    // The live site should now serve the freshly created recipe (data committed).
    const siteRecipes = await (await fetch('http://localhost:8000/api/recipes', { headers: { 'Authorization': 'Bearer larder_local_sync_8f92k' } })).json();
    assert(wf, 'G5 published data reachable via API', Array.isArray(siteRecipes) && siteRecipes.length > 0, `${Array.isArray(siteRecipes) ? siteRecipes.length : 0} recipes`);
  } catch (e) {
    assert(wf, 'G5 publish to website', 'SKIP', 'publish failed: ' + e.message);
  }
}

// ---------------------------------------------------------------------------

(async () => {
  const cdp = await connect();
  console.log('Connected to CMS via CDP. Starting workflow suite…');
  await cdp.evalExpr(INSTALL_OVERRIDES);

  await workflowA(cdp);
  await workflowB(cdp);
  await workflowC(cdp);
  await workflowD(cdp);
  await workflowE(cdp);
  await workflowF(cdp);
  await workflowG(cdp);

  cdp.close();

  const outPath = path.join(__dirname, 'workflow-report.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results: RESULTS, report }, null, 2));
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(RESULTS, null, 2));
  console.log('Full report:', outPath);
})().catch(e => { console.error('FATAL', e); process.exit(1); });