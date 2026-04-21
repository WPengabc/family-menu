<script setup>
defineOptions({ name: 'OrderPage' })
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createOrderLocal, enqueueCloudOp, getCategories, getDishes } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { familySyncBus } from '../lib/familySyncBus'
import DishThumb from '../components/DishThumb.vue'

const router = useRouter()
const route = useRoute()

const categories = ref([])
const activeCategoryId = ref('all')
const dishes = ref([])
const selected = ref(new Set())

const sidebarItems = computed(() => [
  { id: 'all', name: '全部' },
  ...categories.value.map((c) => ({ id: c.id, name: c.name })),
])

const activeSideIndex = computed(() => {
  const i = sidebarItems.value.findIndex((it) => it.id === activeCategoryId.value)
  return i < 0 ? 0 : i
})

const selectedCount = computed(() => selected.value.size)
const canGen = computed(() => selectedCount.value > 0)

async function refresh() {
  categories.value = await getCategories()
  dishes.value = await getDishes({ categoryId: activeCategoryId.value })
}

async function setCategoryByIndex(index) {
  const item = sidebarItems.value[index]
  if (!item) return
  activeCategoryId.value = item.id
  dishes.value = await getDishes({ categoryId: item.id })
}

function toggleDish(id) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function clearSelected() {
  selected.value = new Set()
}

async function genOrder() {
  if (!canGen.value) return
  try {
    const all = await getDishes({ categoryId: 'all' })
    const picked = all.filter((d) => selected.value.has(d.id))
    const o = await createOrderLocal(picked)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_order', entityId: o.id, payload: { row: o } })
    showOk(`已生成订单：${o.id}（本机）`)
    clearSelected()
    router.push('/orders')
  } catch (e) {
    showError(e)
  }
}

onMounted(refresh)

let menuDebounce = null
watch(
  () => [familySyncBus.dishesRev, familySyncBus.categoriesRev],
  () => {
    if (route.path !== '/order') return
    clearTimeout(menuDebounce)
    menuDebounce = setTimeout(() => void refresh(), 200)
  },
)
</script>

<template>
  <div class="wrap">
    <div class="layout">
      <!-- 左侧分类：使用 Vant Sidebar -->
      <aside class="side">
        <van-sidebar
          :model-value="activeSideIndex"
          @change="setCategoryByIndex"
        >
          <van-sidebar-item
            v-for="it in sidebarItems"
            :key="it.id"
            :title="it.name"
          />
        </van-sidebar>
      </aside>

      <!-- 右侧菜品列表 -->
      <section class="main">
        <div class="mainHead">
          <h2>点菜</h2>
          <van-button
            size="small"
            plain
            round
            :disabled="selectedCount === 0"
            @click="clearSelected"
          >
            清空
          </van-button>
        </div>

        <van-empty
          v-if="dishes.length === 0"
          image="search"
          description="该分类暂无菜品，去「我的」添加新菜吧"
        />

        <div v-else class="dishList">
          <div
            v-for="d in dishes"
            :key="d.id"
            class="dish"
            :class="{ on: selected.has(d.id) }"
            role="button"
            :aria-pressed="selected.has(d.id)"
            @click="toggleDish(d.id)"
          >
            <DishThumb
              :imagePath="d.image_path"
              :alt="`${d.name} 图片`"
              :fallbackTitle="`${d.name} 暂无图片`"
              className="thumb"
            />
            <div class="info">
              <div class="name">{{ d.name }}</div>
              <div class="sub">
                {{ (d.ingredients_text || '').slice(0, 30) }}
                <span v-if="(d.ingredients_text || '').length > 30">…</span>
              </div>
            </div>
            <van-checkbox
              :model-value="selected.has(d.id)"
              shape="round"
              checked-color="var(--brand-orange-strong)"
              @click.stop
              @update:model-value="toggleDish(d.id)"
            />
          </div>
        </div>
      </section>
    </div>

    <!-- 底部提交栏 -->
    <van-submit-bar
      class="submitBar"
      :disabled="!canGen"
      button-text="生成订单"
      button-type="warning"
      safe-area-inset-bottom
      @submit="genOrder"
    >
      <template #default>
        <span v-if="selectedCount > 0" class="submitTip">
          已选 <b>{{ selectedCount }}</b> 道菜
        </span>
        <span v-else class="submitTip muted">还未选择菜品</span>
      </template>
    </van-submit-bar>
  </div>
</template>

<style scoped>
.wrap {
  padding-bottom: calc(50px + var(--van-tabbar-height) + env(safe-area-inset-bottom));
}

.layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.side {
  width: 108px;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  padding: 6px 0;
  position: sticky;
  top: 62px;
  max-height: calc(100vh - 62px - 56px - 70px);
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.side :deep(.van-sidebar) {
  width: 100%;
}

.side :deep(.van-sidebar-item) {
  background: transparent;
}

.main {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  padding: 14px;
}

.mainHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.dishList {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dish {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: #fff;
  transition: all 0.15s ease;
  cursor: pointer;
  user-select: none;
}

.dish:active {
  transform: scale(0.99);
}

.dish.on {
  border-color: rgba(245, 146, 50, 0.6);
  background: rgba(255, 177, 90, 0.08);
  box-shadow: 0 0 0 2px rgba(245, 146, 50, 0.15) inset;
}

.thumb {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}

.thumb.ph {
  display: block;
  background: linear-gradient(135deg, rgba(255, 177, 90, 0.28), rgba(46, 125, 50, 0.18));
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 16px;
  font-weight: 800;
  color: var(--brand-ink);
}

.sub {
  margin-top: 4px;
  color: #8a8473;
  font-size: 13px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.submitBar {
  bottom: calc(var(--van-tabbar-height) + env(safe-area-inset-bottom)) !important;
}

.submitBar :deep(.van-submit-bar__button) {
  font-weight: 700;
}

.submitTip {
  font-size: 14px;
  color: var(--brand-ink);
}
.submitTip.muted {
  color: #8a8473;
}
.submitTip b {
  color: var(--brand-orange-strong);
  font-weight: 900;
  margin: 0 2px;
}

@media (max-width: 520px) {
  .layout { gap: 8px; }
  .side { width: 92px; }
  .main { padding: 10px; }
  .thumb { width: 56px; height: 56px; }
}
</style>
