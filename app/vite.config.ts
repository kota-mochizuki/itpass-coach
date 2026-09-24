import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'iパス コーチ',
        short_name: 'iパス',
        description: 'ITパスポート試験 2026/11/8 合格のための学習コーチ',
        lang: 'ja',
        start_url: './',
        display: 'standalone',
        background_color: '#f6f3ec',
        theme_color: '#24406b',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // アプリ本体と問題データは事前キャッシュ。原本画像（約75MB）は表示時にキャッシュ
        globPatterns: ['**/*.{js,css,html,svg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.includes('/q/'),
          handler: 'CacheFirst',
          options: { cacheName: 'question-images', expiration: { maxEntries: 2000 } },
        }],
      },
    }),
  ],
  test: { environment: 'node', setupFiles: ['./src/test/setup.ts'] },
});
