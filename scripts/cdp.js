'use strict';
const WebSocket = require('ws');

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.onEvent = null;
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
    });
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method && this.onEvent) {
        this.onEvent(msg);
      }
    });
    await this.send('Runtime.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const mid = ++this.id;
      const t = setTimeout(() => { this.pending.delete(mid); reject(new Error('CDP timeout ' + method)); }, 30000);
      this.pending.set(mid, (msg) => { clearTimeout(t); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); });
      this.ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }

  async evalExpr(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error('Eval error: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result && res.result.value;
  }

  async evalValue(expression) {
    return await this.evalExpr(expression);
  }

  async call(fnSource, ...args) {
    const fn = typeof fnSource === 'string' ? fnSource : `(${fnSource.toString()})`;
    const argJson = args.map(a => JSON.stringify(a)).join(',');
    return this.evalExpr(`(${fn})(${argJson})`);
  }

  async click(selector) {
    return this.evalExpr(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found' };
      el.click();
      return { ok: true };
    })()`);
  }

  async setInput(selector, value, { dispatchChange = true } = {}) {
    return this.evalExpr(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found' };
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (${dispatchChange}) el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);
  }

  async setChecked(selector, checked) {
    return this.evalExpr(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found' };
      if (el.checked !== ${checked}) {
        el.click();
      }
      return { ok: true, checked: el.checked };
    })()`);
  }

  async selectOption(selector, value) {
    return this.evalExpr(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, reason: 'not found' };
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: el.value };
    })()`);
  }

  async text(selector) {
    return this.evalExpr(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? el.innerText || el.textContent || '' : null;
    })()`);
  }

  async html(selector) {
    return this.evalExpr(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? el.outerHTML : null;
    })()`);
  }

  async count(selector) {
    return this.evalExpr(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  }

  async exists(selector) {
    return this.evalExpr(`!!document.querySelector(${JSON.stringify(selector)})`);
  }

  async waitFor(selectorOrFn, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let done = false;
      if (typeof selectorOrFn === 'string') {
        done = await this.exists(selectorOrFn);
      } else {
        done = await this.evalExpr(`(function(){ try { return !!(${selectorOrFn}); } catch(e) { return false; } })()`);
      }
      if (done) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  }

  async api(method, path, body) {
    return this.evalExpr(`(async () => {
      const res = await fetch(${JSON.stringify(path)}, {
        method: ${JSON.stringify(method)},
        headers: { 'Authorization': 'Bearer larder_local_sync_8f92k', 'Content-Type': 'application/json' },
        body: ${body ? JSON.stringify(JSON.stringify(body)) : 'undefined'}
      });
      const data = res.ok ? await res.json() : null;
      return { ok: res.ok, status: res.status, data };
    })()`);
  }

  async apiGet(path) {
    return this.api('GET', path);
  }

  close() {
    try { this.ws.close(); } catch (e) { /* ignore */ }
  }
}

async function connect({ match = /cms/i } = {}) {
  const targets = await (await fetch('http://localhost:9223/json')).json();
  const page = targets.find(t => t.type === 'page' && match.test(t.title || '')) || targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  return cdp;
}

async function newTarget(url) {
  // /json/new isn't supported in Electron; use browser-level CDP Target.createTarget.
  const { webSocketDebuggerUrl } = await (await fetch('http://localhost:9223/json/version')).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  const id = Date.now();
  const result = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { reject(new Error('timeout Target.createTarget')); }, 20000);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id === id) { clearTimeout(t); resolve(m.result); }
    });
    ws.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url, newWindow: true } }));
  });
  ws.close();
  return result.targetInfo || result;
}

async function listTargets() {
  return (await (await fetch('http://localhost:9223/json')).json());
}

async function connectTarget(wsUrl) {
  const cdp = new CDP(wsUrl);
  await cdp.open();
  return cdp;
}

async function closeTarget(targetId) {
  const { webSocketDebuggerUrl } = await (await fetch('http://localhost:9223/json/version')).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  const id = Date.now();
  await new Promise((resolve) => {
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id === id) resolve(m.result); });
    ws.send(JSON.stringify({ id, method: 'Target.closeTarget', params: { targetId } }));
  });
  ws.close();
}

module.exports = { CDP, connect, listTargets, newTarget, connectTarget, closeTarget };