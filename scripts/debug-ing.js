'use strict';
const { connect } = require('./cdp');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const cdp = await connect();
  await cdp.evalExpr(`(() => { window.alert = m => { console.log('[alert]', m); }; window.confirm = () => true; return true; })()`);

  // Open editor
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="recipe"]'); if (t) t.click(); return true; })()`);
  await sleep(400);
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-recipe-btn'); if (b) b.click(); return true; })()`);
  await sleep(400);
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-ing-btn'); if (b) b.click(); return true; })()`);
  await sleep(300);

  const before = await cdp.count('#ingredients-container .cms-ingredient-row');
  console.log('rows before:', before);
  await cdp.evalExpr(`(() => {
    const row = document.querySelector('#ingredients-container .cms-ingredient-row:first-of-type');
    const input = row && row.querySelector('input[data-field="name"]');
    if (!input) return 'no input';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Rice');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('keyup', { bubbles: true }));
    return 'typed';
  })()`);
  await sleep(400);
  const sugg = await cdp.evalExpr(`(() => {
    const list = document.querySelector('#ingredients-container .cms-ingredient-row:first-of-type .cms-ing-suggestions');
    return list ? list.outerHTML.slice(0, 800) : 'NO LIST';
  })()`);
  console.log('SUGGESTIONS AFTER TYPE:', sugg);

  await cdp.evalExpr(`(() => {
    const row = document.querySelector('#ingredients-container .cms-ingredient-row:first-of-type');
    const list = row.querySelector('.cms-ing-suggestions');
    const s = list && list.querySelector('.cms-ing-suggestion');
    if (s) { s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })); return 'dispatched'; }
    return 'nothing to click';
  })()`);
  await sleep(300);
  const foodId = await cdp.evalExpr(`(() => {
    const row = document.querySelector('#ingredients-container .cms-ingredient-row:first-of-type');
    return row ? row.dataset.foodId : 'no row';
  })()`);
  console.log('foodId after click:', foodId);
  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });