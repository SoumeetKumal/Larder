'use strict';
const { connect } = require('./cdp');

(async () => {
  const cdp = await connect();

  // Food tab
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="food"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 500));
  const food = await cdp.evalExpr(`(() => {
    const cont = document.getElementById('cms-recipe-list');
    return { html: cont ? cont.outerHTML.slice(0, 2500) : 'NO CONT', addBtn: !!document.getElementById('add-recipe-btn') };
  })()`);
  console.log('=== FOOD TAB ===');
  console.log(food.html);

  // Open first food item editor
  await cdp.evalExpr(`(() => { const card = document.querySelector('[data-food-id]'); if (card) card.click(); return !!card; })()`);
  await new Promise(r => setTimeout(r, 400));
  const foodModal = await cdp.evalExpr(`(() => {
    const m = document.getElementById('cms-food-modal');
    if (!m || !m.classList.contains('active')) return 'MODAL NOT ACTIVE';
    return [...m.querySelectorAll('input, select, textarea')].map(e => (e.id||'') + '|' + e.tagName + '|' + (e.type||'')).join('\\n');
  })()`);
  console.log('=== FOOD MODAL FIELDS ===');
  console.log(foodModal);
  await cdp.evalExpr(`(() => { const b = document.getElementById('cancel-food-btn'); if (b) b.click(); return true; })()`);

  // Pantry tab: open add editor
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="pantry"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 500));
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-recipe-btn'); if (b) b.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 400));
  const pantryModal = await cdp.evalExpr(`(() => {
    const modal = document.querySelector('.modal-overlay.active');
    return modal ? [...modal.querySelectorAll('input, select, textarea, button')].map(e => (e.id||'') + '|' + e.tagName + '|' + (e.type||'') + '|' + (e.textContent||'').trim().slice(0,20)).join('\\n') : 'NO ACTIVE MODAL';
  })()`);
  console.log('=== PANTRY ADD MODAL ===');
  console.log(pantryModal);
  await cdp.evalExpr(`(() => { const b = document.querySelector('.modal-overlay.active .modal-close, .modal-overlay.active .cms-close'); if (b) b.click(); return true; })()`);

  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });