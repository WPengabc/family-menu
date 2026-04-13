import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      includeAssets: ['favicon.ico', 'mask-icon.svg', 'vite.svg'],
      manifest: {
        name: '家庭点菜',
        short_name: '点菜',
        description: '家庭离线点菜与订单互通（PWA）',
        theme_color: '#F3EBDD',
        background_color: '#F3EBDD',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/vite.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
