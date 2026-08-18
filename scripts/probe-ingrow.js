'use strict';
const { connect } = require('./cdp');

(async () => {
  const cdp = await connect();

  // Recipe editor: add an ingredient row, inspect inputs; then open cooked dialog
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="recipe"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 400));
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-recipe-btn'); if (b) b.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 400));
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-ing-btn'); if (b) b.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 300));
  const ingRow = await cdp.evalExpr(`(() => {
    const row = document.querySelector('.cms-ingredient-row');
    if (!row) return 'NO ROW';
    return row.outerHTML.slice(0, 2600);
  })()`);
  console.log('=== ING ROW ===');
  console.log(ingRow);

  const sugg = await cdp.evalExpr(`(() => {
    const input = document.querySelector('.cms-ingredient-row input[data-field="name"]');
    if (!input) return 'no input';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Tagliatelle');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('keyup', { bubbles: true }));
    return true;
  })()`);
  await new Promise(r => setTimeout(r, 400));
  const suggHtml = await cdp.evalExpr(`(() => {
    const list = document.querySelector('.cms-ing-suggestions');
    return list ? list.outerHTML.slice(0, 1800) : 'NO SUGGESTIONS';
  })()`);
  console.log('=== SUGGESTIONS ===');
  console.log(suggHtml);

  // Close modal
  await cdp.evalExpr(`(() => { const b = document.getElementById('cancel-recipe-btn'); if (b) b.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 300));

  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });