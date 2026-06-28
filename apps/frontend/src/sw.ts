/// <reference lib="webworker" />
/**
 * Service worker tuỳ biến (injectManifest) — L1 PWA.
 *
 * Gồm: precache app shell + offline-cache API (NetworkFirst allowlist, port từ cấu hình
 * workbox cũ) + xử lý Web Push (`push` → hiện thông báo hệ thống; `notificationclick` →
 * mở/đưa lên trước tab app tới link CV). Đổi từ generateSW sang injectManifest để chèn được
 * 2 handler push mà generateSW không cho tuỳ biến.
 */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// autoUpdate: SW mới kích hoạt ngay khi mở lại (không kẹt ở waiting).
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Điều hướng SPA offline → index.html (trừ API).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

// Offline đọc lại list/chi tiết CV đã tải. ALLOWLIST (chỉ JSON list/detail không nhạy cảm) —
// KHÔNG cache ảnh mộc/chữ ký (/image,/asset), file nhị phân (/file,/download,/preview,.xlsx,
// .zip), hay /api/auth/me. Negative lookahead loại nhánh nhị phân dưới cùng prefix.
const API_ALLOW =
  /\/api\/(?:incoming|outgoing|tasks|search|tags|organizations|units|notifications)(?![^?]*(?:\/file|\/download|\/image|\/asset|\/preview|attachments|\.xlsx|\.zip))/i;
registerRoute(
  ({ url, request }) => request.method === 'GET' && API_ALLOW.test(url.pathname),
  new NetworkFirst({
    cacheName: 'qlcv-api',
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  }),
);

// Font Google (offline shell giữ đúng typography).
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'qlcv-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

/* ── Web Push ─────────────────────────────────────────────────────────── */
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  if (event.data) {
    try {
      data = event.data.json() as PushPayload;
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = data.title || 'QLCV Thành Đạt';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'qlcv-task',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data?.url as string | undefined) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Có tab app đang mở → đưa lên trước + điều hướng; không thì mở tab mới.
      for (const client of clientList) {
        if ('focus' in client) {
          void client.focus();
          if ('navigate' in client) void (client as WindowClient).navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target).then(() => undefined);
    }),
  );
});
