import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import { registerSW } from 'virtual:pwa-register'
import { router } from './router'
import { refreshAuth, refreshFamily } from './lib/appState'

registerSW({
  immediate: true,
  onNeedRefresh() {
    // 家庭场景：不强打断，给后续 UI 做提示即可；先简单自动刷新
  },
  onOfflineReady() {
    // 离线可用提示可以在 App 内做，这里先不打扰
  },
})

// 进入「我的」前强制从 Supabase 恢复会话，避免 Tab 切换后界面误判未登录
router.beforeEach((to, _from, next) => {
  const isMe = to.path === '/me' || to.path.startsWith('/me/')
  if (!isMe) {
    next()
    return
  }
  Promise.all([refreshAuth(), refreshFamily()])
    .then(() => next())
    .catch(() => next())
})

createApp(App).use(router).mount('#app')
