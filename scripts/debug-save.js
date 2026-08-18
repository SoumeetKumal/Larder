'use strict';
const { connect } = require('./cdp');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const cdp = await connect();
  await cdp.evalExpr(`(() => { window.alert = m => { console.log('[alert]', m); window.__lastAlert = m; }; window.confirm = () => true; return true; })()`);
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="recipe"]'); if (t) t.click(); return true; })()`);
  await sleep(400);
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-recipe-btn'); if (b) b.click(); return true; })()`);
  await sleep(400);
  const title = 'E2E Debug Risotto ' + Date.now().toString(36);
  await cdp.setInput('#recipe-title', title);
  await cdp.setInput('#recipe-desc', 'Debug recipe');
  await cdp.selectOption('#recipe-category', 'Grains');
  await cdp.setInput('#recipe-time-mins', '30');
  await cdp.setInput('#macro-yield', '4');

  async function addIng(name, mn, mu, inn, iu, create) {
    const before = await cdp.count('#ingredients-container .cms-ingredient-row');
    await cdp.click('#add-ing-btn');
    await sleep(300);
    const after = await cdp.count('#ingredients-container .cms-ingredient-row');
    const sel = `#ingredients-container .cms-ingredient-row:nth-of-type(${after})`;
    await cdp.evalExpr(`(() => {
      const row = document.querySelector(${JSON.stringify(sel)});
      const input = row.querySelector('input[data-field="name"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('keyup', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    const clicked = await cdp.evalExpr(`(() => {
      const row = document.querySelector(${JSON.stringify(sel)});
      const list = row.querySelector('.cms-ing-suggestions');
      const s = list && list.querySelector(${JSON.stringify(create ? '.cms-ing-create' : '.cms-ing-suggestion')});
      if (!s) return 'no-match';
      s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      return 'dispatched';
    })()`);
    await sleep(200);
    const foodId = await cdp.evalExpr(`(() => { const row = document.querySelector(${JSON.stringify(sel)}); return row.dataset.foodId; })()`);
    if (mn) await cdp.setInput(`${sel} [data-field="metric-num"]`, mn);
    if (mu) await cdp.selectOption(`${sel} [data-field="metric-unit"]`, mu);
    if (inn) await cdp.setInput(`${sel} [data-field="imperial-num"]`, inn);
    if (iu) await cdp.selectOption(`${sel} [data-field="imperial-unit"]`, iu);
    return { clicked, foodId };
  }

  const r1 = await addIng('Rice', '300', 'g', '1.5', 'cups', false);
  console.log('rice:', r1);
  const r2 = await addIng('Maitake Shiitake Blend', '1', '', '', 'whole', true);
  console.log('blend:', r2);
  const r3 = await addIng('Parmesan Cheese', '50', 'g', '', '', false);
  console.log('parmesan:', r3);

  await cdp.evalExpr(`(() => { const f = document.getElementById('recipe-form'); const b = f.querySelector('button[type="submit"]'); if (b) b.click(); return !!b; })()`);
  await sleep(1400);
  const alert = await cdp.evalExpr(`window.__lastAlert || ''`);
  console.log('alert after save:', alert);
  const recs = await cdp.apiGet('/api/recipes');
  const created = recs.data.find(r => r.title === title);
  console.log('created:', created ? JSON.stringify({ id: created.id, ings: created.ingredients.map(i => ({ i: i.item, f: i.foodId })) }) : 'NOT FOUND');
  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });