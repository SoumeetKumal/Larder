'use strict';
const { connect } = require('./cdp');

async function main() {
  const cdp = await connect();

  // Activate each tab and capture key DOM facts
  const tabs = ['mealplan', 'planner', 'recipe', 'food', 'pantry', 'household', 'shopping', 'receipts', 'stats'];
  for (const tab of tabs) {
    const r = await cdp.evalExpr(`(() => {
      const el = document.querySelector('.cms-tab[data-tab="${tab}"]');
      if (!el) return { ok: false, reason: 'no tab el' };
      el.click();
      return { ok: true };
    })()`);
    await new Promise(r => setTimeout(r, 500));
    const active = await cdp.evalValue(`document.querySelector('.cms-tab.active')?.dataset.tab`);
    const listChildren = await cdp.count('#cms-recipe-list > *');
    const firstEl = await cdp.evalValue(`(() => {
      const c = document.querySelector('#cms-recipe-list');
      if (!c || !c.firstElementChild) return null;
      return c.firstElementChild.className + ' :: ' + (c.firstElementChild.innerText || '').slice(0, 60).replace(/\\n/g, ' | ');
    })()`);
    console.log(`${tab}: active=${active} listChildren=${listChildren} first=[${firstEl}]`);
  }

  cdp.close();
}

main().catch(e => { console.error('DRIVER ERR', e); process.exit(1); });