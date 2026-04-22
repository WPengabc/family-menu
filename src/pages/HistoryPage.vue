<script setup>
defineOptions({ name: 'HistoryPage' })
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { deleteOrderLocal, enqueueCloudOp, listHistoryOrders } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { familySyncBus } from '../lib/familySyncBus'
import { formatTime } from '../lib/utils'

const router = useRouter()
const route = useRoute()
const filterDays = ref(7)
const orders = ref([])

const FILTER_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 0, label: '全部' },
]

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
  orders.value = await listHistoryOrders()
}

async function del(orderId) {
  try {
    await showConfirmDialog({
      title: '删除历史订单',
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
    showOk('已删除（本机）')
    await refresh()
  } catch (e) {
    showError(e)
  }
}

onMounted(refresh)

watch(
  () => familySyncBus.ordersRev,
  () => {
    if (route.path !== '/me/history') return
    void refresh()
  },
)
</script>

<template>
  <div class="wrap">
    <div class="sectionBar">
      <button type="button" class="linkBtn backBtn" @click="router.back()">
        <van-icon name="arrow-left" />
        <span>返回</span>
      </button>
      <h2>历史订单</h2>
      <span class="linkBtn placeholder" aria-hidden="true">返回</span>
    </div>

    <div class="segmented" role="tablist">
      <button
        v-for="opt in FILTER_OPTIONS"
        :key="opt.value"
        type="button"
        class="segItem"
        :class="{ on: filterDays === opt.value }"
        role="tab"
        :aria-selected="filterDays === opt.value"
        @click="filterDays = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <van-empty
      v-if="filtered.length === 0"
      image="search"
      description="暂无历史订单"
    />

    <van-swipe-cell
      v-for="o in filtered"
      v-else
      :key="o.id"
      class="orderCell"
    >
      <div class="orderCard">
        <div class="orderHead">
          <div class="oidWrap">
            <div class="oid">{{ o.id }}</div>
            <div class="placedBy">下单人：{{ o.placed_by_label || '—' }}</div>
          </div>
          <van-tag :type="o.status === '已完成' ? 'success' : 'default'" round size="medium">
            {{ o.status }}
          </van-tag>
        </div>

        <div class="meta">
          <span>下单 {{ formatTime(o.created_at) }}</span>
          <span class="sep">·</span>
          <span>完成 {{ formatTime(o.completed_at) }}</span>
        </div>

        <div v-if="(o.snapshot_dishes || []).length" class="dishLine">
          {{ (o.snapshot_dishes || []).map((d) => d.name).join('、') }}
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
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  padding: 6px 4px 0;
}

h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  text-align: center;
  color: var(--text-primary);
  letter-spacing: 0.1px;
}

.linkBtn {
  background: none;
  border: none;
  padding: 4px 4px;
  color: var(--brand-orange-strong);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.linkBtn.placeholder {
  visibility: hidden;
}

.backBtn .van-icon {
  font-size: 16px;
}

.segmented {
  display: flex;
  background: rgba(60, 60, 67, 0.1);
  border-radius: 9px;
  padding: 2px;
  margin: 4px 4px 6px;
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
  transition: all 0.18s ease;
}

.segItem.on {
  background: var(--surface-card-solid);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}

.orderCell {
  border-radius: 14px;
  overflow: hidden;
  background: transparent;
}

.orderCard {
  background: var(--surface-card-solid);
  border: 0.5px solid var(--hairline-soft);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.dishLine {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  padding: 6px 10px;
  background: rgba(60, 60, 67, 0.05);
  border-radius: 8px;
}

.swipeBtn {
  height: 100%;
  min-width: 72px;
}
</style>
