import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'ResearchBox 定性研究工具箱',
        short_name: 'ResearchBox',
        description: 'AI 定性研究工作台：把访谈录音与文字资料转化为可编码、可引用、可聚合、可导出的研究洞察。',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'any',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // 新 SW 立即接管 + 清理旧缓存，避免用户卡在旧版本
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // 缓存版本号变更，强制刷新所有资源
        cacheId: 'researchbox-v2'
      }
    })
  ],
  server: { host: true, port: 5173 }
});
