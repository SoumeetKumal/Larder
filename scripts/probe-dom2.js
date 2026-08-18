'use strict';
const { connect } = require('./cdp');

(async () => {
  const cdp = await connect();
  const tabs = ['mealplan', 'planner', 'recipe', 'food', 'pantry', 'household', 'shopping', 'receipts', 'stats'];
  for (const t of tabs) {
    const r = await cdp.evalExpr(`(() => {
      const tab = document.querySelector('.cms-tab[data-tab="${t}"]');
      if (tab) tab.click();
      return { clicked: !!tab };
    })()`);
    await new Promise(r => setTimeout(r, 600));
    const info = await cdp.evalExpr(`(() => {
      const g = id => { const e = document.getElementById(id); return e ? (e.id + ':' + (e.tagName||'')) : null; };
      const sels = [
        '.mp-slot', '#meal-assign-modal', '#meal-assign-search', '#meal-assign-confirm', '#meal-assign-cancel',
        '#meal-template-save', '#meal-template-list', '#meal-copy-days', '#meal-assign-eaters-list',
        '#confirm-plan-btn', '#save-mealplan-btn', '.mp-picker-item', '.mp-picker-product',
        '.pl-item-row', '.pl-ing-row', '.pl-product-select', '#pl-generate-btn', '.pl-sugg-chip', '#pl-add-row',
        '.pl-item', '.pl-name', '.pl-amount', '.pl-unit', '.pl-scope',
        '.shop-gen-panel', '#generate-list-btn', '.shop-src', '#shop-template-select', '#shop-view-current', '#shop-view-past',
        '#rc-store', '#rc-date', '#rc-total', '#rc-paste', '#rc-parse-btn', '#rc-scan-btn', '#rc-items-rows', '#rc-save-btn', '.rc-line',
        '#household-form', '.hh-item', '.hh-item-row', '#hh-add-btn', '.hh-stock-input', '.hh-minstock', '.hh-duration',
        '#stats-grid', '.stat-card', '#stats-period', '.stats-section',
        '.cms-ing-suggestion', '.cms-ing-create', '#recipe-tags-add', '.cms-ingredient-row',
        '#recipe-status', '#macro-auto-calc-btn', '#cms-delete-btn', '#cms-cooked-btn'
      ];
      const out = {};
      for (const s of sels) out[s] = document.querySelectorAll(s).length;
      return { tab: '${t}', out };
    })()`);
    console.log(JSON.stringify(info));
  }
  cdp.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });