/* Versioned app shell. All files must be available before an update installs. */
const CACHE_PREFIX = 'master-calc-v2-palette-';
const CACHE_NAME = 'master-calc-v2-palette-d563cd749b3c';
const APP_FILES = ['./', './index.html', './styles.css', './core.js', './app.js', './manifest.json', './icon.png'];
const APP_URLS = new Set(APP_FILES.map(path => new URL(path, self.location.href).href));
const INDEX_URL = new URL('./index.html', self.location.href).href;

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...APP_URLS])));
});
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    url.search = ''; url.hash = '';
    if (!APP_URLS.has(url.href)) return;
    // Serve a consistent set of files from the currently activated version.
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(url.href);
        if (cached) return cached;
        try { return await fetch(request); }
        catch (error) {
            if (request.mode === 'navigate') {
                const fallback = await cache.match(INDEX_URL);
                if (fallback) return fallback;
            }
            return new Response('Приложение ещё не загружено для офлайн-работы', {status:503, headers:{'Content-Type':'text/plain;charset=utf-8'}});
        }
    }));
});
