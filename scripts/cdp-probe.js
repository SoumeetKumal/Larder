'use strict';
const WebSocket = require('ws');

const TARGETS = 'http://localhost:9223/json';

async function main() {
  const targets = await (await fetch(TARGETS)).json();
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await new Promise((r) => ws.on('open', r));
  await send('Runtime.enable');

  const expr = `(() => {
    const globals = Object.keys(window).filter(k => /^(App|CMS|Larder|LC|State|CMP|planner|render)/.test(k)).sort();
    const state = {};
    try {
      state.currentCMSTab = window.currentCMSTab;
      state.titlebar = !!document.getElementById('larder-titlebar');
      state.bodyPadTop = getComputedStyle(document.body).paddingTop;
      state.tabs = Array.from(document.querySelectorAll('.cms-tab')).map(t => t.dataset.tab);
      state.activeTab = document.querySelector('.cms-tab.active')?.dataset.tab;
      state.hasPlanner = typeof window.CMSPlanner;
      state.hasCalc = typeof window.LarderCalc;
      state.heading = document.title;
    } catch (e) { state.err = String(e); }
    return JSON.stringify({ globals, state });
  })()`;

  const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(res.result.result.value);
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });