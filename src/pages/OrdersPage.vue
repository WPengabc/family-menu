<script setup>
defineOptions({ name: 'OrdersPage' })
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { completeOrderLocal, deleteOrderLocal, enqueueCloudOp, listOrders } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { familySyncBus } from '../lib/familySyncBus'
import { formatTime } from '../lib/utils'

const route = useRoute()
const orders = ref([])
const activeCollapses = ref({})

function ensureCollapseState() {
  const next = {}
  for (const o of orders.value) {
    next[o.id] = activeCollapses.value[o.id] ?? ''
  }
  activeCollapses.value = next
}

async function refresh() {
  orders.value = await listOrders()
  ensureCollapseState()
}

async function complete(orderId) {
  try {
    await showConfirmDialog({
      title: '完成订单',
      message: '确认完成本次点菜订单？完成后会归档到历史。',
      confirmButtonText: '完成订单',
      confirmButtonColor: 'var(--brand-orange-strong)',
    })
  } catch {
    return
  }
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
  try {
    await showConfirmDialog({
      title: '删除订单',
      message: '删除后无法恢复，确认要删除该订单？',
      confirmButtonText: '删除',
      confirmButtonColor: 'var(--van-danger-color)',
    })
  } catch {
    return
  }
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
  <div class="wrap">
    <section class="headerCard">
      <div class="row">
        <h2>订单</h2>
        <van-button size="small" plain round icon="replay" @click="refresh">刷新</van-button>
      </div>
      <div class="hint">未完成订单会置顶显示，完成后自动归档到历史。左滑订单可以快速删除。</div>
    </section>

    <van-empty
      v-if="orders.length === 0"
      image="search"
      description="暂无订单，去点菜页勾选生成订单吧"
    />

    <template v-else>
      <van-swipe-cell
        v-for="o in orders"
        :key="o.id"
        class="orderCell"
      >
        <div class="orderCard" :class="{ done: o.status === '已完成' }">
          <div class="orderHead">
            <div class="oidWrap">
              <div class="oid">{{ o.id }}</div>
              <div class="placedBy">下单人：{{ o.placed_by_label || '—' }}</div>
            </div>
            <van-tag
              :type="o.status === '已完成' ? 'success' : 'warning'"
              round
              size="medium"
              plain
            >
              {{ o.status }}
            </van-tag>
          </div>

          <div class="meta">
            <span>下单 {{ formatTime(o.created_at) }}</span>
            <span class="sep">·</span>
            <span>完成 {{ formatTime(o.completed_at) }}</span>
          </div>

          <van-collapse v-model="activeCollapses[o.id]" accordion :border="false" class="collapseBlock">
            <van-collapse-item :name="o.id">
              <template #title>
                <span class="collapseTitle">
                  查看菜品 <span class="countBadge">{{ (o.snapshot_dishes || []).length }}</span>
                </span>
              </template>
              <div class="snap">
                <div
                  v-for="d in (o.snapshot_dishes || [])"
                  :key="d.dish_id"
                  class="snapItem"
                >
                  <div class="snapName">{{ d.name }}</div>
                  <div class="snapIng">{{ d.simple_ingredients }}</div>
                </div>
              </div>
            </van-collapse-item>
          </van-collapse>

          <div v-if="o.status === '未完成'" class="orderActions">
            <van-button
              size="normal"
              type="warning"
              round
              block
              icon="success"
              @click="complete(o.id)"
            >
              完成订单
            </van-button>
          </div>
        </div>

        <template #right>
          <van-button
            square
            type="danger"
            class="swipeBtn"
            text="删除"
            @click="del(o.id)"
          />
        </template>
      </van-swipe-cell>
    </template>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.headerCard {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  padding: 14px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.hint {
  margin-top: 8px;
  color: #8a8473;
  font-size: 13px;
  line-height: 1.55;
}

.orderCell {
  border-radius: 14px;
  overflow: hidden;
  background: transparent;
}

.orderCell :deep(.van-swipe-cell__wrapper) {
  transition: transform 0.25s ease;
}

.orderCard {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.orderCard.done {
  background: rgba(255, 255, 255, 0.6);
  opacity: 0.92;
}

.orderHead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.oidWrap {
  min-width: 0;
  flex: 1;
}

.oid {
  font-size: 17px;
  font-weight: 900;
  color: var(--brand-ink);
  word-break: break-all;
}

.placedBy {
  margin-top: 4px;
  font-size: 14px;
  color: #5a5545;
  font-weight: 600;
}

.meta {
  color: #8a8473;
  font-size: 13px;
  line-height: 1.5;
}

.sep {
  margin: 0 6px;
  opacity: 0.6;
}

.collapseBlock {
  background: transparent;
  border-radius: 10px;
  margin: 0 -6px;
}

.collapseBlock :deep(.van-collapse-item__title) {
  background: rgba(255, 177, 90, 0.08);
  border-radius: 10px;
  padding: 10px 12px;
}

.collapseBlock :deep(.van-collapse-item__title::after) {
  display: none;
}

.collapseBlock :deep(.van-collapse-item__content) {
  background: transparent;
  padding: 10px 4px 0;
}

.collapseTitle {
  font-weight: 700;
  font-size: 14px;
  color: var(--brand-ink);
}

.countBadge {
  display: inline-block;
  background: var(--brand-orange-strong);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  border-radius: 999px;
  padding: 1px 8px;
  margin-left: 4px;
  min-width: 20px;
  text-align: center;
}

.snap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snapItem {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 177, 90, 0.07);
  border: 1px solid rgba(255, 177, 90, 0.18);
}

.snapName {
  font-weight: 800;
  font-size: 15px;
  color: var(--brand-ink);
}

.snapIng {
  margin-top: 3px;
  font-size: 13px;
  color: #6b6555;
  line-height: 1.4;
}

.orderActions {
  margin-top: 2px;
}

.swipeBtn {
  height: 100%;
  min-width: 72px;
}
</style>
