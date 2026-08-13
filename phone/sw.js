// Larder phone PWA service worker. Caches the phone shell + shared assets so the
// checklist stays usable offline and relaunches instantly. Data reads always go
// to the network (the app falls back to last-known state when offline).
'use strict';

const CACHE_NAME = 'larder-phone-v1';
const PRECACHE = [
    './',
    './index.html',
    './phone.css',
    './app.js',
    './manifest.webmanifest',
    '../styles.css',
    '../calc.js',
    '../sync-client.js',
    '../images/icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.map((k) => {
            if (k !== CACHE_NAME) return caches.delete(k);
            return undefined;
        }))).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname === '/api/' || url.pathname.startsWith('/api/')) return;
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return res;
            }).catch(() => caches.match('./index.html'));
        })
    );
});