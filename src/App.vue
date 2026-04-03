<script setup>
import { onMounted } from 'vue'
import AppShell from './components/AppShell.vue'
import { initApp } from './lib/appState'

onMounted(() => {
  void initApp()
})
</script>

<template>
  <AppShell>
    <router-view v-slot="{ Component }">
      <keep-alive :include="['OrderPage', 'OrdersPage', 'MePage', 'HistoryPage']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </AppShell>
</template>

<style scoped></style>
