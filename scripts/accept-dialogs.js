'use strict';
const WebSocket = require('ws');
(async () => {
  const v = await (await fetch('http://localhost:9223/json/version')).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let id = 0;
  const pending = new Map();
  ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  const { result: targets } = await send('Target.getTargets');
  const cms = targets.targetInfos.find(t => /cms/i.test(t.title || '') && t.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', { targetId: cms.targetId, flatten: true });
  const ssend = (method, params = {}) => send(method, Object.assign({}, params, { sessionId }));
  for (let i = 0; i < 5; i++) {
    try { await ssend('Page.handleJavaScriptDialog', { accept: true }); console.log('accepted dialog #' + i); } catch (e) { console.log('no dialog #' + i); }
  }
  const info = await send('Target.getTargetInfo', { targetId: cms.targetId });
  console.log(JSON.stringify(info.result.targetInfo));
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });