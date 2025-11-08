// ultra-light cache
const CACHE = 'catalog-v21';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// حد بالای آیتم‌های کش برای safety
const MAX_ENTRIES = 200;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// کمک: پاکسازی کش اگر خیلی بزرگ شد
async function trimCache() {
  const c = await caches.open(CACHE);
  const keys = await c.keys();
  if (keys.length > MAX_ENTRIES) {
    await c.delete(keys[0]); // قدیمی‌ترین
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // فقط GET ها را هندل کن
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // app shell → cache-first
  const isAppShell = sameOrigin && ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '/')));
  if (isAppShell) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req))
    );
    return;
  }

  // برای API و عکس‌ها:
  // - network-first
  // - فقط پاسخ‌های same-origin یا opaque کوچک را نکشیم (opaque جاگیر است)
  const isFunction = sameOrigin && url.pathname.startsWith('/.netlify/functions/');
  const isImageLike =
    req.destination === 'image' ||
    /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/.test(url.pathname);

  if (isFunction || isImageLike) {
    e.respondWith(
      fetch(req)
        .then(async (resp) => {
          // اگر پاسخ ok و same-origin بود کش کن
          if (resp.ok && sameOrigin) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).then(trimCache).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(req)) // آفلاین
    );
    return;
  }

  // سایر درخواست‌های GET → تلاش از شبکه، در خطا از کش
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok && sameOrigin) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).then(trimCache).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

