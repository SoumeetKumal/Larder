'use strict';
const { connect } = require('./cdp');

async function main() {
  const cdp = await connect();

  // Open recipe editor (new recipe)
  await cdp.evalExpr(`document.querySelector('.cms-tab[data-tab="recipe"]').click()`);
  await new Promise(r => setTimeout(r, 400));
  await cdp.evalExpr(`document.getElementById('add-recipe-btn').click()`);
  await new Promise(r => setTimeout(r, 500));

  const editor = await cdp.evalValue(`(() => {
    const m = document.getElementById('cms-editor-modal');
    if (!m) return null;
    const ids = [];
    m.querySelectorAll('[id]').forEach(el => ids.push(el.id));
    const btns = [];
    m.querySelectorAll('button').forEach(b => { if (b.id) btns.push(b.id + '::' + (b.innerText||'').trim().slice(0,20)); });
    return { ids, btns };
  })()`);
  console.log('EDITOR IDs:', JSON.stringify(editor.ids, null, 0));
  console.log('EDITOR BTNS:', JSON.stringify(editor.btns, null, 0));

  // Add an ingredient row to inspect its DOM
  await cdp.evalExpr(`document.getElementById('add-ing-btn').click()`);
  await new Promise(r => setTimeout(r, 300));
  const ingRow = await cdp.evalValue(`(() => {
    const row = document.querySelector('.cms-ingredient-row');
    if (!row) return null;
    return { cls: row.className, fields: Array.from(row.querySelectorAll('[data-field]')).map(f => f.getAttribute('data-field')), html: row.outerHTML.slice(0, 600) };
  })()`);
  console.log('\nINGROW:', JSON.stringify(ingRow, null, 1));

  // Cancel to close
  await cdp.evalExpr(`document.getElementById('cancel-recipe-btn').click()`);
  await new Promise(r => setTimeout(r, 300));

  // Pantry tab DOM
  await cdp.evalExpr(`document.querySelector('.cms-tab[data-tab="pantry"]').click()`);
  await new Promise(r => setTimeout(r, 500));
  const pantry = await cdp.evalValue(`(() => {
    const ids = [];
    document.querySelectorAll('#cms-recipe-list [id]').forEach(el => ids.push(el.id));
    const cookedBtns = document.querySelectorAll('button');
    const labels = [];
    cookedBtns.forEach(b => { const t=(b.innerText||'').trim(); if (/cooked|used|pantry|track|stock/i.test(t)) labels.push((b.id||'')+'::'+t.slice(0,25)); });
    return { ids, labels };
  })()`);
  console.log('\nPANTRY ids:', JSON.stringify(pantry.ids));
  console.log('PANTRY labels:', JSON.stringify(pantry.labels, null, 0));

  cdp.close();
}
main().catch(e => { console.error('ERR', e); process.exit(1); });