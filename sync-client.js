// Real-time sync client for Larder's /ws endpoint. Web-compatible (works in the
// CMS page, Electron renderer, and phone PWA). No-ops gracefully when WebSocket
// is unavailable (jsdom tests, offline, unsupported browsers). Subscribes per
// dataset and calls onUpdate(dataset, body) when the server broadcasts.
(function (global) {
    'use strict';

    class SyncClient {
        constructor(options) {
            const opts = options || {};
            this.onUpdate = typeof opts.onUpdate === 'function' ? opts.onUpdate : function () {};
            this.url = opts.url || (location && location.protocol === 'https:' ? 'wss' : 'ws') + '://' + (location && location.host || 'localhost:8000') + '/ws';
            this.reconnectMs = opts.reconnectMs || 3000;
            this.datasets = new Set();
            this.ready = false;
            this.ws = null;
            this._retryTimer = null;
            this._connect();
        }

        _connect() {
            if (this._stopped) return;
            if (typeof WebSocket === 'undefined') return;
            let ws;
            try {
                ws = new WebSocket(this.url);
            } catch (e) {
                this.ws = null;
                return;
            }
            this.ws = ws;
            ws.onopen = () => {
                this.ready = true;
                this.datasets.forEach(ds => this._send({ type: 'subscribe', dataset: ds }));
            };
            ws.onmessage = (ev) => {
                let msg;
                try {
                    msg = JSON.parse(ev.data);
                } catch (e) {
                    return;
                }
                if (!msg || msg.type !== 'update') return;
                try {
                    this.onUpdate(msg.dataset, JSON.parse(msg.body));
                } catch (e) { /* keep the UI stable on transient payloads */ }
            };
            ws.onclose = () => {
                this.ready = false;
                this.ws = null;
                if (this._stopped) return;
                if (this._retryTimer) return;
                this._retryTimer = setTimeout(() => {
                    this._retryTimer = null;
                    this._connect();
                }, this.reconnectMs);
            };
            ws.onerror = () => {
                try { ws.close(); } catch (e) { /* ignore */ }
            };
        }

        subscribe(dataset) {
            this.datasets.add(dataset);
            if (this.ready) this._send({ type: 'subscribe', dataset });
        }

        send(delta) {
            this._send(delta);
        }

        _send(obj) {
            if (this.ws && this.ws.readyState === 1) {
                try {
                    this.ws.send(JSON.stringify(obj));
                } catch (e) { /* connection dropped; reconnect timer handles it */ }
            }
        }

        close() {
            this._stopped = true;
            if (this._retryTimer) {
                clearTimeout(this._retryTimer);
                this._retryTimer = null;
            }
            if (this.ws) {
                try { this.ws.close(); } catch (e) { /* ignore */ }
                this.ws = null;
            }
            this.ready = false;
        }
    }

    global.SyncClient = SyncClient;
    if (typeof module !== 'undefined' && module.exports) module.exports = SyncClient;
})(typeof window !== 'undefined' ? window : globalThis);
