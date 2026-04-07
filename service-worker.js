const CACHE_NAME = 'gaegebu-v1';
const STATIC_ASSETS = [
  './우리_가계부_firebase.html',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=DM+Mono:wght@400;500&display=swap'
];

// 설치: 핵심 파일 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['./우리_가계부_firebase.html']);
    })
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: 네트워크 우선 → 실패 시 캐시
// Firebase 요청은 항상 네트워크로 (실시간 동기화 보장)
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Firebase / Google API는 캐시 없이 항상 네트워크
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('googleapis.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 나머지: 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 성공 시 캐시 업데이트
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서
        return caches.match(event.request);
      })
  );
});
