// يحفظ ملفات التطبيق على الجهاز ليفتح فورًا ويعمل دون إنترنت.
// غيّر VERSION عند كل تحديث لتنزل النسخة الجديدة.
const VERSION = 'raff-v29';
const FONTS = 'raff-fonts';
const CORE = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
  './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/anthropic-sdk.mjs',
  './vendor/tesseract/tesseract.min.js', './vendor/tesseract/worker.min.js', './vendor/tesseract/worker-wrap.js',
  './vendor/tesseract/tesseract-core-simd-lstm.wasm.js', './vendor/tesseract/tesseract-core-lstm.wasm.js',
  './vendor/tessdata/ara-traineddata.wasm', './vendor/tessdata/eng-traineddata.wasm', './samples/sample.pdf',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' يتجاوز ذاكرة المتصفح المؤقتة، فلا تُخزَّن نسخة قديمة من الملفات تحت الإصدار الجديد
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
    return res;
  })).catch(() => caches.match('./index.html')));
});
