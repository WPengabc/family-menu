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
          <span
            v-if="!appState.online"
            class="statusDot statusDot--off"
            aria-label="离线"
            title="离线"
          />
          <van-tag v-if="syncText" round :type="syncTagType" size="small">
            {{ syncText }}
          </van-tag>
          <span
            v-if="appState.online && !syncText"
            class="statusDot statusDot--on"
            aria-label="在线"
            title="在线"
          />
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

.brand {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.1px;
  color: var(--text-primary);
}

.rightStatus {
  display: flex;
  gap: 6px;
  align-items: center;
}

.statusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}

.statusDot--on {
  background: var(--ios-green);
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.22);
}

.statusDot--off {
  background: var(--ios-red);
  box-shadow: 0 0 0 2px rgba(255, 59, 48, 0.22);
}

.content {
  padding: 10px 0 12px;
  max-width: 900px;
  margin: 0 auto;
}
</style>
