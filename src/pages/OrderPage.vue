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
    <div class="sectionBar">
      <h2>点菜</h2>
      <button
        type="button"
        class="linkBtn"
        :class="{ disabled: selectedCount === 0 }"
        :disabled="selectedCount === 0"
        @click="clearSelected"
      >
        清空选择
      </button>
    </div>

    <div class="layout">
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

      <section class="main">
        <van-empty
          v-if="dishes.length === 0"
          image="search"
          description="该分类暂无菜品，去「我的」添加新菜吧"
        />

        <van-cell-group v-else inset class="dishGroup">
          <div
            v-for="d in dishes"
            :key="d.id"
            class="dishRow"
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
            <span
              class="checkMark"
              :class="{ on: selected.has(d.id) }"
              aria-hidden="true"
            >
              <van-icon v-if="selected.has(d.id)" name="success" />
            </span>
          </div>
        </van-cell-group>
      </section>
    </div>

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

.sectionBar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 20px 10px;
}

h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.linkBtn {
  background: none;
  border: none;
  padding: 2px 4px;
  color: var(--brand-orange-strong);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.linkBtn.disabled,
.linkBtn:disabled {
  color: var(--text-tertiary);
  cursor: default;
}

.layout {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 0 16px;
}

.side {
  width: 92px;
  background: var(--surface-card);
  border-radius: 14px;
  padding: 6px 0;
  position: sticky;
  top: 62px;
  max-height: calc(100vh - 62px - 56px - 70px);
  overflow: auto;
  border: 0.5px solid var(--hairline-soft);
}

.side :deep(.van-sidebar) {
  width: 100%;
}

.side :deep(.van-sidebar-item) {
  background: transparent;
  padding: 11px 10px;
}

.side :deep(.van-sidebar-item__text) {
  font-size: 13px;
}

.main {
  flex: 1;
  min-width: 0;
}

.dishGroup {
  margin: 0 !important;
  background: var(--surface-card-solid);
  border-radius: 14px;
  overflow: hidden;
}

.dishRow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  position: relative;
  transition: background 0.15s ease;
}

.dishRow + .dishRow {
  border-top: 0.5px solid var(--hairline-soft);
}

.dishRow:active {
  background: rgba(60, 60, 67, 0.08);
}

.dishRow.on {
  background: rgba(255, 177, 90, 0.1);
}

.thumb {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  border: 0.5px solid var(--hairline-soft);
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
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
}

.sub {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 12.5px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checkMark {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--ios-gray-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.checkMark.on {
  background: var(--brand-orange-strong);
  border-color: var(--brand-orange-strong);
  color: #fff;
}

.checkMark .van-icon {
  font-size: 14px;
  font-weight: 700;
}

.submitBar {
  bottom: calc(var(--van-tabbar-height) + env(safe-area-inset-bottom)) !important;
}

.submitBar :deep(.van-submit-bar__button) {
  font-weight: 600;
  padding: 0 20px;
  height: 38px;
  line-height: 38px;
  border-radius: 19px;
}

.submitTip {
  font-size: 14px;
  color: var(--text-primary);
}

.submitTip.muted {
  color: var(--text-tertiary);
}

.submitTip b {
  color: var(--brand-orange-strong);
  font-weight: 700;
  margin: 0 2px;
}

@media (max-width: 520px) {
  .layout { gap: 8px; padding: 0 12px; }
  .side { width: 86px; }
  .thumb { width: 44px; height: 44px; }
}
</style>
