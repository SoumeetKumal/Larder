'use strict';
const { connect } = require('./cdp');

(async () => {
  const cdp = await connect();

  // Planner: dump first item + product select options
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="planner"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 500));
  const pl = await cdp.evalExpr(`(() => {
    const item = document.querySelector('.pl-item');
    const sel = document.querySelector('.pl-product-select');
    return {
      itemHtml: item ? item.outerHTML.slice(0, 1600) : 'NO ITEM',
      selectOptions: sel ? [...sel.options].map(o => o.value + '=' + o.textContent.trim()).slice(0, 12) : 'NO SELECT',
      suggChips: [...document.querySelectorAll('.pl-sugg-chip')].map(c => c.textContent.trim()).slice(0, 8)
    };
  })()`);
  console.log('=== PLANNER ===');
  console.log(JSON.stringify(pl, null, 1));

  // Receipts: paste text and parse
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="receipts"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 500));
  await cdp.setInput('#rc-store', 'Provencal');
  await cdp.setInput('#rc-date', '2026-08-16');
  await cdp.setInput('#rc-total', '250');
  await cdp.setInput('#rc-paste', 'Tagliatelle 55.00\nChicken Breast 450.00\nGarlic 25.00\nTOTAL 250.00');
  await cdp.click('#rc-parse-btn');
  await new Promise(r => setTimeout(r, 700));
  const rc = await cdp.evalExpr(`(() => {
    const rows = document.getElementById('rc-items-rows');
    return rows ? rows.outerHTML.slice(0, 3000) : 'NO ROWS';
  })()`);
  console.log('=== RECEIPT PARSE ===');
  console.log(rc);

  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });