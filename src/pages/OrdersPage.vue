<script setup>
defineOptions({ name: 'OrdersPage' })
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { completeOrderLocal, deleteOrderLocal, enqueueCloudOp, listOrders } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { familySyncBus } from '../lib/familySyncBus'
import { formatTime } from '../lib/utils'

const route = useRoute()
const orders = ref([])

async function refresh() {
  orders.value = await listOrders()
}

async function complete(orderId) {
  if (!confirm('确认完成本次点菜订单？')) return
  try {
    const row = await completeOrderLocal(orderId)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_order', entityId: row.id, payload: { row } })
    showOk('订单已完成（本机）')
    await refresh()
  } catch (e) {
    showError(e)
  }
}

async function del(orderId) {
  if (!confirm('确认删除该订单？')) return
  try {
    await deleteOrderLocal(orderId)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'delete_order', entityId: orderId, payload: { id: orderId } })
    showOk('已删除订单（本机）')
    await refresh()
  } catch (e) {
    showError(e)
  }
}

onMounted(refresh)

let ordersDebounce = null
watch(
  () => familySyncBus.ordersRev,
  () => {
    if (route.path !== '/orders') return
    clearTimeout(ordersDebounce)
    ordersDebounce = setTimeout(() => void refresh(), 120)
  },
)
</script>

<template>
  <section class="card">
    <div class="row">
      <h2>订单</h2>
      <button class="btn sm" @click="refresh">刷新</button>
    </div>
    <div class="hint">未完成订单会置顶显示，完成后自动归档到历史。</div>
  </section>

  <section v-if="orders.length === 0" class="card">
    <div class="empty">暂无订单。去点菜页勾选生成订单吧。</div>
  </section>

  <section v-for="o in orders" :key="o.id" class="card">
    <div class="row">
      <div>
        <div class="oid">{{ o.id }}</div>
        <div class="meta">
          状态：<b :class="{ ok: o.status === '已完成' }">{{ o.status }}</b>
          <span class="sep">·</span> 下单：{{ formatTime(o.created_at) }}
          <span class="sep">·</span> 完成：{{ formatTime(o.completed_at) }}
        </div>
        <div class="placedBy">下单人：{{ o.placed_by_label || '—' }}</div>
      </div>
      <div class="actions">
        <button v-if="o.status === '未完成'" class="btn primary sm" @click="complete(o.id)">完成订单</button>
        <button class="btn sm danger" @click="del(o.id)">删除</button>
      </div>
    </div>

    <details class="details">
      <summary>查看菜品与简化食材</summary>
      <div class="snap">
        <div v-for="d in (o.snapshot_dishes || [])" :key="d.dish_id" class="snapItem">
          <div class="name">{{ d.name }}</div>
          <div class="ing">{{ d.simple_ingredients }}</div>
        </div>
      </div>
    </details>
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
.hint { margin-top: 8px; opacity: .78; line-height: 1.55; }
.empty { padding: 16px 0; opacity: .8; }
.oid { font-size: 18px; font-weight: 900; }
.meta { margin-top: 4px; opacity: .78; line-height: 1.5; }
.placedBy { margin-top: 6px; font-size: 15px; font-weight: 800; color: #3d3d3d; }
.sep { margin: 0 6px; opacity: .6; }
.ok { color: #2e7d32; }
.actions { display:flex; gap:8px; }
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
.details { margin-top: 10px; }
summary { font-weight: 900; cursor: pointer; }
.snap { margin-top: 10px; display:flex; flex-direction:column; gap:10px; }
.snapItem { padding: 10px; border-radius: 12px; border:1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.55); }
.name { font-weight: 900; font-size: 16px; }
.ing { margin-top: 4px; opacity: .78; }
</style>

