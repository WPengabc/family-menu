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
    <router-view />
  </AppShell>
</template>

<style scoped></style>
