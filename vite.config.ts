import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './': aplikacija radi na bilo kojoj putanji (GitHub Pages podmapa, vlastita domena, lokalno) bez prepravljanja.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Booklet Studio',
        short_name: 'Booklets',
        description: 'Make booklets and flyers of painted shoes — works offline, on phone, tablet and PC.',
        theme_color: '#1A1A1A',
        background_color: '#FAF9F6',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] },
    }),
  ],
});
