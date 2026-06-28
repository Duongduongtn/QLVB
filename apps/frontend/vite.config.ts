import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: './src/routes' }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'QLCV Thành Đạt',
        short_name: 'QLCV',
        description: 'Quản lý Công văn + Ký số',
        theme_color: '#f5efe3', // giấy (khớp <meta theme-color> + header app)
        background_color: '#f7f3ea',
        display: 'standalone',
        lang: 'vi',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Offline đọc lại list/chi tiết CV đã tải gần đây. ALLOWLIST (chỉ JSON list/detail
            // không nhạy cảm) — KHÔNG cache ảnh mộc/chữ ký (/image,/asset), file nhị phân
            // (/file,/download,/preview,.xlsx,.zip), hay /api/auth/me (tránh tưởng phiên còn
            // sống offline). Negative lookahead loại nhánh nhị phân dưới cùng prefix.
            urlPattern:
              /\/api\/(?:incoming|outgoing|tasks|search|tags|organizations|units|notifications)(?![^?]*(?:\/file|\/download|\/image|\/asset|\/preview|attachments|\.xlsx|\.zip))/i,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'qlcv-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Font Google (offline shell giữ đúng typography).
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'qlcv-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '~': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8003',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
