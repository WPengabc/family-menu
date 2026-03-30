<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { appState } from '../lib/appState'
import { cloudEnabled, getSignedDishImageUrl } from '../lib/cloudRepo'

const props = defineProps({
  imagePath: { type: String, default: null },
  className: { type: String, default: 'thumb' },
})

const src = ref('')
const isData = computed(() => (props.imagePath ?? '').startsWith('data:') || (props.imagePath ?? '').startsWith('http'))
const isStoragePath = computed(() => !!props.imagePath && !isData.value)

async function resolve() {
  if (!props.imagePath) {
    src.value = ''
    return
  }
  if (isData.value) {
    src.value = props.imagePath
    return
  }
  if (!cloudEnabled() || !appState.session) {
    // 没云/没登录：无法生成 signed url
    src.value = ''
    return
  }
  try {
    src.value = await getSignedDishImageUrl(props.imagePath)
  } catch {
    src.value = ''
  }
}

watch(() => props.imagePath, resolve)
watch(() => appState.session, resolve)

onMounted(resolve)
</script>

<template>
  <img v-if="src" :class="className" :src="src" alt="" />
  <div v-else :class="[className, 'ph']"></div>
</template>

