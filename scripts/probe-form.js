'use strict';
const { connect } = require('./cdp');

(async () => {
  const cdp = await connect();
  await cdp.evalExpr(`(() => { const t = document.querySelector('.cms-tab[data-tab="recipe"]'); if (t) t.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 400));
  await cdp.evalExpr(`(() => { const b = document.getElementById('add-recipe-btn'); if (b) b.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 400));
  const fields = await cdp.evalExpr(`(() => {
    const form = document.getElementById('recipe-form');
    if (!form) return 'NO FORM';
    const els = [...form.querySelectorAll('input, select, textarea')].map(e => (e.id || '') + '|' + e.tagName + '|' + (e.type||'') + '|' + (e.name||''));
    return els.join('\\n');
  })()`);
  console.log('=== FORM FIELDS ===');
  console.log(fields);

  // Need to select a recipe first to see cooked dialog. Open the seeded tagliatelle recipe by API id
  const recipes = await cdp.apiGet('/api/recipes');
  const target = recipes.data.find(r => r.id === 'recipe_creamy_chicken_tagliatelle');
  console.log('=== TARGET ===', JSON.stringify(target && { id: target.id, title: target.title }));

  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });