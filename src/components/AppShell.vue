<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appState } from '../lib/appState'

const route = useRoute()
const router = useRouter()

const tabs = [
  { name: 'order', label: '点菜', path: '/order', icon: 'shop-o' },
  { name: 'orders', label: '订单', path: '/orders', icon: 'orders-o' },
  { name: 'me', label: '我的', path: '/me', icon: 'user-o' },
]

const active = computed(() => {
  if (route.path === '/me' || route.path.startsWith('/me/')) return 'me'
  return tabs.find((t) => route.path === t.path)?.name ?? ''
})

const syncText = computed(() => {
  if (appState.syncPhase === 'syncing') return '同步中...'
  if (appState.syncPhase === 'queued' && appState.queuedOps > 0) return `待同步 ${appState.queuedOps}`
  if (appState.syncPhase === 'error') return '同步异常'
  return ''
})

const syncTagType = computed(() => (appState.syncPhase === 'error' ? 'danger' : 'warning'))

function onTabChange(name) {
  const t = tabs.find((x) => x.name === name)
  if (t && t.path !== route.path) router.push(t.path)
}
</script>

<template>
  <div class="app">
    <van-nav-bar class="topbar" :border="false" fixed placeholder>
      <template #title>
        <span class="brand">家庭点菜</span>
      </template>
      <template #right>
        <div class="rightStatus">
          <van-tag
            round
            :type="appState.online ? 'success' : 'default'"
            size="medium"
          >
            {{ appState.online ? '在线' : '离线' }}
          </van-tag>
          <van-tag v-if="syncText" round :type="syncTagType" size="medium">
            {{ syncText }}
          </van-tag>
        </div>
      </template>
    </van-nav-bar>

    <main class="content">
      <slot />
    </main>

    <van-tabbar
      :model-value="active"
      safe-area-inset-bottom
      active-color="var(--brand-orange-strong)"
      inactive-color="#8a8473"
      @change="onTabChange"
    >
      <van-tabbar-item
        v-for="t in tabs"
        :key="t.name"
        :name="t.name"
        :icon="t.icon"
      >
        {{ t.label }}
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--brand-cream);
  color: var(--brand-ink);
  padding-bottom: calc(var(--van-tabbar-height) + env(safe-area-inset-bottom));
}

.topbar :deep(.van-nav-bar) {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.brand {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.3px;
}

.rightStatus {
  display: flex;
  gap: 6px;
  align-items: center;
}

.content {
  padding: 12px 16px 16px;
  max-width: 900px;
  margin: 0 auto;
}
</style>
