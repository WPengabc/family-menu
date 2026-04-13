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

const selectedCount = computed(() => selected.value.size)
const canGen = computed(() => selectedCount.value > 0)

async function refresh() {
  categories.value = await getCategories()
  dishes.value = await getDishes({ categoryId: activeCategoryId.value })
}

async function setCategory(id) {
  activeCategoryId.value = id
  dishes.value = await getDishes({ categoryId: id })
}

function toggleDish(id, checked) {
  const s = new Set(selected.value)
  if (checked) s.add(id)
  else s.delete(id)
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
      <!-- 左侧分类：常驻（不弹出） -->
      <aside class="side">
        <div class="sideTop">
          <div class="sideTitle">分类</div>
        </div>
        <div class="sideList">
          <button class="cat" :class="{ on: activeCategoryId === 'all' }" @click="setCategory('all')">全部</button>
          <button
            v-for="c in categories"
            :key="c.id"
            class="cat"
            :class="{ on: activeCategoryId === c.id }"
            @click="setCategory(c.id)"
          >
            {{ c.name }}
          </button>
        </div>
      </aside>

      <!-- 右侧菜品列表：美团外卖风格卡片 -->
      <section class="main">
        <div class="mainHead">
          <h2>点菜</h2>
          <button class="btn sm" @click="clearSelected" :disabled="selectedCount === 0">清空</button>
        </div>

        <div v-if="dishes.length === 0" class="empty">该分类暂无菜品，去“我的”添加新菜吧。</div>

        <div v-else class="dishList">
          <label v-for="d in dishes" :key="d.id" class="dish" :class="{ on: selected.has(d.id) }">
            <input
              type="checkbox"
              class="chk"
              :checked="selected.has(d.id)"
              @change="toggleDish(d.id, $event.target.checked)"
            />
            <DishThumb :imagePath="d.image_path" :alt="`${d.name} 图片`" :fallbackTitle="`${d.name} 暂无图片`" className="thumb" />
            <div class="info">
              <div class="name">{{ d.name }}</div>
              <div class="sub">
                {{ (d.ingredients_text || '').slice(0, 30) }}
                <span v-if="(d.ingredients_text||'').length>30">…</span>
              </div>
            </div>
          </label>
        </div>
      </section>
    </div>

    <!-- 底部主按钮（固定） -->
    <div class="bottomBar">
      <button class="btn primary wide" :disabled="!canGen" @click="genOrder">
        生成订单（{{ selectedCount }}）
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap { padding-bottom: 86px; }
.layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.side {
  width: 140px;
  background: rgba(255,255,255,0.65);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 10px;
  position: sticky;
  top: 90px;
  max-height: calc(100vh - 120px - 56px);
  overflow: auto;
}
.sideTitle { font-weight: 900; margin: 4px 0 10px; }
.sideList { display:flex; flex-direction:column; gap:10px; }
.cat {
  text-align:left;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.10);
  background: rgba(255,255,255,0.6);
  font-size: 15px;
  font-weight: 900;
}
.cat.on { background: rgba(255, 177, 90, 0.35); border-color: rgba(255,177,90,0.55); }
.main {
  flex: 1;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 14px;
}
.mainHead { display:flex; justify-content:space-between; align-items:center; gap:10px; }
h2 { margin: 0; font-size: 18px; }
.empty { padding: 16px 0; opacity: .8; }
.dishList { margin-top: 10px; display:flex; flex-direction:column; gap:10px; }
.dish {
  display:flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.55);
}
.dish.on { border-color: rgba(255,177,90,0.7); box-shadow: 0 0 0 2px rgba(255,177,90,0.18) inset; }
.chk { width: 22px; height: 22px; margin: 0; }
.thumb {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(0,0,0,0.04);
}
.thumb.ph {
  display: block;
  background: linear-gradient(135deg, rgba(255,177,90,0.28), rgba(46,125,50,0.18));
}
.name { font-size: 16px; font-weight: 900; }
.info { flex: 1; min-width: 0; }
.sub { margin-top: 4px; opacity: .75; font-size: 13px; line-height: 1.25; }
.btn {
  padding: 12px 14px;
  border-radius: 12px;
  border: none;
  background: rgba(0,0,0,0.06);
  color: #2b2b2b;
  font-size: 16px;
  font-weight: 800;
}
.btn.primary { background:#ffb15a; }
.btn.sm { padding: 10px 12px; font-size: 14px; }
.btn:disabled { opacity: .55; }
.bottomBar {
  position: fixed; left: 0; right: 0; bottom: calc(56px + env(safe-area-inset-bottom));
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, rgba(243,235,221,0.96), rgba(243,235,221,0.65));
}
.wide { width: 100%; }

@media (max-width: 520px) {
  .layout { gap: 10px; }
  .side { width: 120px; top: 90px; }
  .main { padding: 12px; }
}
</style>

