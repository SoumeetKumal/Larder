'use strict';
const { connect } = require('./cdp');

(async () => {
  const cdp = await connect();

  // Household tab
  const hh = await cdp.evalExpr(`(() => {
    const tab = document.querySelector('.cms-tab[data-tab="household"]');
    if (tab) tab.click();
    return !!tab;
  })()`);
  await new Promise(r => setTimeout(r, 700));
  const hhInfo = await cdp.evalExpr(`(() => {
    const el = document.getElementById('cms-recipe-list');
    const rows = el ? [...el.querySelectorAll('*')].filter(n => /hh-|household|\.hh-|minStock|stock|duration/i.test(n.className||'') || /id=["']hh/i.test((n.outerHTML||'').slice(0,120))).slice(0,40) : [];
    return { html: el ? el.outerHTML.slice(0, 6000) : 'NO CONTAINER' };
  })()`);
  console.log('=== HOUSEHOLD ===');
  console.log(hhInfo.html);

  // Stats tab
  const st = await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="stats"]'); if (t) t.click(); return !!t; })()`);
  await new Promise(r => setTimeout(r, 700));
  const stInfo = await cdp.evalExpr(`(() => {
    const el = document.getElementById('cms-recipe-list');
    return el ? el.outerHTML.slice(0, 7000) : 'NO CONTAINER';
  })()`);
  console.log('=== STATS ===');
  console.log(stInfo);

  // Recipe editor: open add modal and dump form action buttons
  const ed = await cdp.evalExpr(`(() => {
    const tab = document.querySelector('.cms-tab[data-tab="recipe"]');
    if (tab) tab.click();
    return true;
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-recipe-btn'); if (b) b.click(); return !!b; })()`);
  await new Promise(r => setTimeout(r, 500));
  const edInfo = await cdp.evalExpr(`(() => {
    const modal = document.getElementById('cms-editor-modal');
    if (!modal || !modal.classList.contains('active')) return 'MODAL NOT ACTIVE';
    const buttons = [...modal.querySelectorAll('button')].map(b => (b.type||'') + '|' + (b.id||'') + '|' + (b.className||'').slice(0,40) + '|' + (b.textContent||'').trim().slice(0,30));
    const form = document.getElementById('recipe-form');
    return JSON.stringify({ buttons, hasForm: !!form, formHtml: form ? form.outerHTML.slice(0, 2500) : 'no form' });
  })()`);
  console.log('=== EDITOR ===');
  console.log(edInfo);
  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });