<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getDishes, deleteDishLocal, enqueueCloudOp, listOrders } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { formatTime } from '../lib/utils'

const router = useRouter()
const dishes = ref([])
const activeOrder = ref(null)

const dishCount = computed(() => dishes.value.length)

async function refresh() {
  dishes.value = await getDishes({ categoryId: 'all' })
  const orders = await listOrders()
  activeOrder.value = orders.find((o) => o.status === '未完成') ?? null
}

function goAdd() {
  router.push('/dish/new')
}

async function delDish(id) {
  if (!confirm('确认删除该菜品？')) return
  try {
    const row = await deleteDishLocal(id)
    if (row) await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_dish', entityId: row.id, payload: { row } })
    showOk('已删除（本机）')
    await refresh()
  } catch (e) {
    showError(e)
  }
}

onMounted(refresh)
</script>

<template>
  <section class="card">
    <div class="hero">
      <button class="btn primary" @click="goAdd">+ 添加新菜</button>
      <button class="btn" @click="$router.push('/order')">去点菜</button>
    </div>
    <div v-if="activeOrder" class="hint">
      <b>未完成订单置顶：</b>{{ activeOrder.id }}（下单：{{ formatTime(activeOrder.created_at) }}）
      <button class="link" @click="$router.push('/orders')">查看</button>
    </div>
    <div v-else class="hint">今天想吃点什么？去点菜页勾选生成订单吧。</div>
  </section>

  <section class="card">
    <div class="row">
      <h2>我的菜品库</h2>
      <div class="hint">共 {{ dishCount }} 道</div>
    </div>

    <div v-if="dishes.length === 0" class="empty">
      暂无菜品。点上面的“添加新菜”开始吧。
    </div>

    <div v-else class="list">
      <div v-for="d in dishes" :key="d.id" class="item">
        <div class="left">
          <div class="name">{{ d.name }}</div>
          <div class="sub">{{ (d.ingredients_text || '').slice(0, 28) }}<span v-if="(d.ingredients_text||'').length>28">…</span></div>
        </div>
        <div class="right">
          <button class="btn sm" @click="$router.push(`/dish/${d.id}`)">编辑</button>
          <button class="btn sm danger" @click="delDish(d.id)">删除</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
}
.hero { display:flex; gap:10px; flex-wrap:wrap; }
.row { display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
h2 { margin: 0; font-size: 18px; }
.hint { margin-top: 10px; opacity: .8; line-height: 1.55; }
.empty { padding: 16px 0; opacity: .8; }
.list { margin-top: 8px; display:flex; flex-direction:column; gap:10px; }
.item { display:flex; justify-content:space-between; gap:10px; padding:10px; border-radius:12px; border:1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.55); }
.name { font-size: 18px; font-weight: 800; }
.sub { margin-top: 4px; opacity: .75; }
.right { display:flex; gap:8px; align-items:center; }
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
.btn.danger { background: rgba(211,47,47,0.14); }
.link { margin-left: 8px; border:none; background:transparent; color:#2a6; font-weight:800; font-size:14px; }
</style>

