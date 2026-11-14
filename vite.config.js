import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' lets the same build run from GitHub Pages, Firebase Hosting or a preview link.
export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Chhabra Store',
        short_name: 'Chhabra',
        description: 'Billing, khata and day close for Chhabra Store',
        lang: 'hi',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F5EF',
        theme_color: '#1E40AF',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  build: { target: 'es2019', chunkSizeWarningLimit: 900 }
});
