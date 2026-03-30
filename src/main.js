import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import { registerSW } from 'virtual:pwa-register'
import { router } from './router'

registerSW({
  immediate: true,
  onNeedRefresh() {
    // 家庭场景：不强打断，给后续 UI 做提示即可；先简单自动刷新
  },
  onOfflineReady() {
    // 离线可用提示可以在 App 内做，这里先不打扰
  },
})

createApp(App).use(router).mount('#app')
