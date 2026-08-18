'use strict';
const { connect } = require('./cdp');
(async () => {
  const cdp = await connect();
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="food"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 800));
  const info = await cdp.evalExpr(`(() => {
    const search = document.getElementById('cms-search');
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({ id: t.id, cls: t.className, firstRows: Array.from(t.querySelectorAll('tr')).slice(0,2).map(r => ({ id: r.dataset ? r.dataset.id : undefined, txt: (r.textContent||'').slice(0,60) })) }));
    const foodRows = document.querySelectorAll('tr[data-id]').length;
    const sample = Array.from(document.querySelectorAll('tr[data-id]')).slice(0,3).map(r => r.textContent.slice(0,50));
    return { hasSearch: !!search, tables, foodRows, sample };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });