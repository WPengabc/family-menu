<script setup>
defineOptions({ name: 'OrdersPage' })
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { completeOrderLocal, deleteOrderLocal, enqueueCloudOp, listOrders } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { familySyncBus } from '../lib/familySyncBus'
import { formatTime } from '../lib/utils'

const route = useRoute()
const orders = ref([])
const activeCollapses = ref({})
const activeTab = ref('pending') // 'pending' | 'done'

const pendingOrders = computed(() => orders.value.filter((o) => o.status === '未完成'))
const doneOrders = computed(() => orders.value.filter((o) => o.status === '已完成'))
const visibleOrders = computed(() =>
  activeTab.value === 'pending' ? pendingOrders.value : doneOrders.value,
)

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
    <div class="sectionBar">
      <h2>订单</h2>
      <button type="button" class="linkBtn" @click="refresh">刷新</button>
    </div>

    <div class="segmented" role="tablist">
      <button
        type="button"
        class="segItem"
        :class="{ on: activeTab === 'pending' }"
        role="tab"
        :aria-selected="activeTab === 'pending'"
        @click="activeTab = 'pending'"
      >
        未完成
        <span v-if="pendingOrders.length" class="segBadge">
          {{ pendingOrders.length }}
        </span>
      </button>
      <button
        type="button"
        class="segItem"
        :class="{ on: activeTab === 'done' }"
        role="tab"
        :aria-selected="activeTab === 'done'"
        @click="activeTab = 'done'"
      >
        已完成
        <span v-if="doneOrders.length" class="segBadge segBadge--muted">
          {{ doneOrders.length }}
        </span>
      </button>
    </div>

    <p class="pageHint">左滑订单可快速删除。已完成订单稍后会自动归档到历史。</p>

    <van-empty
      v-if="visibleOrders.length === 0"
      image="search"
      :description="activeTab === 'pending' ? '暂无未完成订单，去点菜页勾选生成订单吧' : '暂无已完成订单'"
    />

    <template v-else>
      <van-swipe-cell
        v-for="o in visibleOrders"
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
            >
              {{ o.status }}
            </van-tag>
          </div>

          <div class="meta">
            <span>下单 {{ formatTime(o.created_at) }}</span>
            <span v-if="o.status === '已完成'">
              <span class="sep">·</span>
              完成 {{ formatTime(o.completed_at) }}
            </span>
          </div>

          <van-collapse v-model="activeCollapses[o.id]" accordion :border="false" class="collapseBlock">
            <van-collapse-item :name="o.id">
              <template #title>
                <span class="collapseTitle">
                  查看菜品
                  <span class="countBadge">{{ (o.snapshot_dishes || []).length }}</span>
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
  gap: 10px;
  padding: 0 16px;
}

.sectionBar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 4px 0;
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

.pageHint {
  margin: 0 4px 4px;
  color: var(--text-tertiary);
  font-size: 12.5px;
  line-height: 1.5;
}

.segmented {
  display: flex;
  background: rgba(60, 60, 67, 0.1);
  border-radius: 9px;
  padding: 2px;
  margin: 4px 0 2px;
}

.segItem {
  flex: 1;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  border-radius: 7px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.18s ease;
}

.segItem.on {
  background: var(--surface-card-solid);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}

.segBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  background: rgba(255, 149, 0, 0.22);
  color: #a45f00;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.segBadge--muted {
  background: rgba(52, 199, 89, 0.18);
  color: var(--ios-green-dim);
}

.segItem:not(.on) .segBadge {
  background: rgba(60, 60, 67, 0.14);
  color: var(--text-secondary);
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
  background: var(--surface-card-solid);
  border: 0.5px solid var(--hairline-soft);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.orderCard.done {
  background: rgba(255, 255, 255, 0.56);
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
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
  letter-spacing: 0.2px;
}

.placedBy {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--text-secondary);
  font-weight: 400;
}

.meta {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.4;
}

.sep {
  margin: 0 6px;
  opacity: 0.6;
}

.collapseBlock {
  background: transparent;
  margin: 0 -4px;
}

.collapseBlock :deep(.van-collapse-item__title) {
  background: rgba(60, 60, 67, 0.06);
  border-radius: 10px;
  padding: 9px 12px;
  min-height: 0;
}

.collapseBlock :deep(.van-cell::after) {
  display: none !important;
}

.collapseBlock :deep(.van-collapse-item__title::after) {
  display: none;
}

.collapseBlock :deep(.van-collapse-item__content) {
  background: transparent;
  padding: 10px 4px 0;
}

.collapseTitle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 13px;
  color: var(--text-secondary);
}

.countBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(60, 60, 67, 0.14);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  padding: 0 7px;
  min-width: 18px;
  height: 16px;
  line-height: 1;
}

.snap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snapItem {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 177, 90, 0.08);
  border: 0.5px solid rgba(255, 177, 90, 0.22);
}

.snapName {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.snapIng {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.orderActions {
  margin-top: 2px;
}

.orderActions :deep(.van-button) {
  height: 38px;
  font-size: 15px;
  font-weight: 600;
}

.swipeBtn {
  height: 100%;
  min-width: 72px;
}
</style>
