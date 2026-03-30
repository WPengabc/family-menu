<script setup>
import { computed, onMounted, ref } from 'vue'
import { deleteOrderLocal, enqueueCloudOp, listOrders } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { formatTime } from '../lib/utils'

const filterDays = ref(7) // 7 / 30 / 0(全部)
const orders = ref([])

const filtered = computed(() => {
  const all = orders.value
  if (filterDays.value === 0) return all
  const ms = filterDays.value * 24 * 60 * 60 * 1000
  const now = Date.now()
  return all.filter((o) => {
    const t = new Date(o.created_at).getTime()
    return now - t <= ms
  })
})

async function refresh() {
  orders.value = await listOrders()
}

async function del(orderId) {
  if (!confirm('确认删除该历史订单？')) return
  try {
    await deleteOrderLocal(orderId)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'delete_order', entityId: orderId, payload: { id: orderId } })
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
    <div class="row">
      <h2>历史订单</h2>
      <button class="btn sm" @click="$router.back()">返回</button>
    </div>
    <div class="filters">
      <button class="pill" :class="{ on: filterDays === 7 }" @click="filterDays = 7">近7天</button>
      <button class="pill" :class="{ on: filterDays === 30 }" @click="filterDays = 30">近30天</button>
      <button class="pill" :class="{ on: filterDays === 0 }" @click="filterDays = 0">全部</button>
    </div>
  </section>

  <section v-if="filtered.length === 0" class="card">
    <div class="empty">暂无历史订单</div>
  </section>

  <section v-for="o in filtered" :key="o.id" class="card">
    <div class="row">
      <div>
        <div class="oid">{{ o.id }}</div>
        <div class="meta">
          状态：<b :class="{ ok: o.status === '已完成' }">{{ o.status }}</b>
          <span class="sep">·</span> 下单：{{ formatTime(o.created_at) }}
          <span class="sep">·</span> 完成：{{ formatTime(o.completed_at) }}
        </div>
        <div class="dishLine">
          菜品：{{ (o.snapshot_dishes || []).map(d => d.name).join('、') }}
        </div>
      </div>
      <button class="btn sm danger" @click="del(o.id)">删除</button>
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
.row { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
h2 { margin: 0; font-size: 18px; }
.filters { display:flex; gap:10px; margin-top: 10px; flex-wrap:wrap; }
.pill {
  border: 1px solid rgba(0,0,0,0.12);
  background: rgba(255,255,255,0.65);
  padding: 10px 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 900;
}
.pill.on { background: rgba(255, 177, 90, 0.35); border-color: rgba(255,177,90,0.55); }
.empty { padding: 16px 0; opacity: .8; }
.oid { font-size: 18px; font-weight: 900; }
.meta { margin-top: 4px; opacity: .78; line-height: 1.5; }
.dishLine { margin-top: 6px; opacity: .82; line-height: 1.55; }
.sep { margin: 0 6px; opacity: .6; }
.ok { color: #2e7d32; }
.btn {
  padding: 12px 14px;
  border-radius: 12px;
  border: none;
  background: rgba(0,0,0,0.06);
  color: #2b2b2b;
  font-size: 16px;
  font-weight: 800;
}
.btn.sm { padding: 10px 12px; font-size: 14px; }
.btn.danger { background: rgba(211,47,47,0.14); }
</style>

