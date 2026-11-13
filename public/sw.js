const CACHE_NAME = 'oneul-date-v0.9.33';
const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest'
];

// 설치 시 정적 자산 사전 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ASSETS).catch(() => {});
      // 첫 방문의 앱 번들은 등록 전에 받아져 fetch 처리기를 지나지 않는다. index.html이 가리키는 해시 이름 번들을 함께 넣는다(P-411)
      // index.html이나 번들을 받지 못하면 번들 추가만 건너뛴다
      try {
        const html = await (await fetch('./index.html', { cache: 'no-cache' })).text();
        const built = [...new Set([...html.matchAll(/"(\/oneul-date\/assets\/[^"]+)"/g)].map((m) => m[1]))];
        if (built.length > 0) await cache.addAll(built);
      } catch {
        // 번들 없이도 install은 마친다
      }
    })
  );
  self.skipWaiting();
});

// 활성화 시 구버전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// fetch 요청 시 전략적 캐싱
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 및 Supabase 실시간 요청은 항상 네트워크 우선
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/api/')) {
    return;
  }

  // spots.json은 앱이 IndexedDB에 따로 보관하므로 서비스 워커가 22.5MB 사본을 Cache Storage에 또 두지 않는다
  if (url.pathname.endsWith('/data/spots.json')) return;

  // GET 요청에 대해 네트워크 우선 + 캐시 폴백 전략
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
          });
        })
    );
  }
});
