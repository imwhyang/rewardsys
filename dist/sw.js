/**
 * 文件: sw.js
 * 描述: 简易 Service Worker，用于缓存静态资源并支持离线访问首页与每日详情页。
 */
const CACHE_NAME = 'bleshi-points-cache-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './main.js',
  './lib/store.js',
  './tabs/roles.js',
  './tabs/tasks.js',
  './tabs/rewards.js',
  './tabs/calendar.js',
  './daily.html',
  './daily.js',
  'https://unpkg.com/vue@3/dist/vue.global.prod.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  if (!isHttp) return;
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => {
          if (
            req.method === 'GET' &&
            res.status === 200 &&
            (url.origin === self.location.origin || res.type === 'basic')
          ) {
            cache.put(req, copy);
          }
        });
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') {
          if (url.pathname.endsWith('/daily.html')) return caches.match('./daily.html');
          return caches.match('./index.html');
        }
        return new Response('离线状态且资源未命中缓存', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

