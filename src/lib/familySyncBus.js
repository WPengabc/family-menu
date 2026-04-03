import { reactive } from 'vue'

/** 远端表变更信号（Realtime / 增量写库），供各 Tab 按需刷新，避免与 appState 循环依赖 */
export const familySyncBus = reactive({
  ordersRev: 0,
  dishesRev: 0,
  categoriesRev: 0,
})
