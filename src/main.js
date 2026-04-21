import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import { router } from './router'
import { refreshSessionAndFamilyFast } from './lib/appState'

// 仅在生产环境注册 Service Worker，开发环境下避免 PWA 缓存干扰 HMR。
if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // 家庭场景优先保持数据一致：检测到新版本后尽快切换，减少旧代码停留时间。
        setTimeout(() => updateSW(true), 1200)
      },
      onOfflineReady() {
        // 离线可用提示可以在 App 内做，这里先不打扰
      },
    })
  })
} else if ('serviceWorker' in navigator) {
  // 卸载开发环境下可能残留的 SW + 清缓存，避免一直加载旧代码。
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))
  if ('caches' in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)))
}

// 进入「我的」前只快速读本地会话，不 await profiles 等网络（否则会卡死导航）
router.beforeEach((to, _from, next) => {
  const isMe = to.path === '/me' || to.path.startsWith('/me/')
  if (!isMe) {
    next()
    return
  }
  refreshSessionAndFamilyFast()
    .then(() => next())
    .catch(() => next())
})

createApp(App).use(router).mount('#app')
