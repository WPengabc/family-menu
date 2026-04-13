<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appState } from '../lib/appState'

const route = useRoute()
const router = useRouter()

const tabs = [
  { name: 'order', label: '点菜', path: '/order' },
  { name: 'orders', label: '订单', path: '/orders' },
  { name: 'me', label: '我的', path: '/me' },
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

function go(path) {
  router.push(path)
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="titleRow">
        <div class="name">家庭点菜</div>
        <div class="rightStatus">
          <span class="badge" :class="{ ok: appState.online }">{{ appState.online ? '在线' : '离线可用' }}</span>
          <span v-if="syncText" class="badge" :class="{ err: appState.syncPhase === 'error' }">{{ syncText }}</span>
        </div>
      </div>
    </header>

    <main class="content">
      <div
        v-if="appState.toast"
        class="toast"
        :class="{ err: appState.toastType === 'err' }"
        role="status"
        aria-live="polite"
      >
        {{ appState.toast }}
      </div>
      <slot />
    </main>

    <nav class="tabbar">
      <button
        v-for="t in tabs"
        :key="t.name"
        class="tab"
        :class="{ on: active === t.name }"
        :aria-current="active === t.name ? 'page' : undefined"
        @click="go(t.path)"
      >
        {{ t.label }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; background: #f3ebdd; color: #2b2b2b; }
.topbar {
  position: sticky; top: 0; z-index: 10;
  padding: 14px 16px;
  background: rgba(243, 235, 221, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.titleRow {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap: 12px;
}
.name { font-size: 18px; font-weight: 900; letter-spacing: .3px; }
.rightStatus { display:flex; gap: 8px; align-items:center; }
.badge {
  font-size: 13px; padding: 4px 10px; border-radius: 999px;
  background: rgba(0,0,0,0.06);
}
.badge.ok { background: rgba(46, 125, 50, 0.14); }
.badge.err { background: rgba(211, 47, 47, 0.14); color: #872121; }
.content { padding: 14px 16px 88px; max-width: 900px; margin: 0 auto; }
.toast {
  margin-bottom: 10px; padding: 10px 12px; border-radius: 12px;
  background: rgba(46, 125, 50, 0.14);
  border: 1px solid rgba(46, 125, 50, 0.22);
}
.toast.err { background: rgba(211, 47, 47, 0.12); border-color: rgba(211, 47, 47, 0.22); }
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: grid; grid-template-columns: repeat(3, 1fr);
  background: rgba(255,255,255,0.92);
  border-top: 1px solid rgba(0,0,0,0.08);
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
}
.tab {
  border: none; background: transparent;
  padding: 10px 6px; font-size: 16px; font-weight: 700;
  border-radius: 12px;
}
.tab.on { background: rgba(255, 177, 90, 0.35); }
</style>

