import { supabase } from './supabase'
import {
  cloudEnabled,
  fetchCategoriesForFamily,
  fetchDishesForFamily,
  fetchOrdersForFamily,
} from './cloudRepo'
import { familySyncBus } from './familySyncBus'
import { replaceTableRows } from './localDb'

let channel = null
let subscribedFamilyId = null

const DEBOUNCE_MS = 120

let tOrders = null
let tDishes = null
let tCats = null

function scheduleOrdersPull(fid) {
  clearTimeout(tOrders)
  tOrders = setTimeout(() => void pullOrdersSafe(fid), DEBOUNCE_MS)
}

function scheduleDishesPull(fid) {
  clearTimeout(tDishes)
  tDishes = setTimeout(() => void pullDishesSafe(fid), DEBOUNCE_MS)
}

function scheduleCatsPull(fid) {
  clearTimeout(tCats)
  tCats = setTimeout(() => void pullCatsSafe(fid), DEBOUNCE_MS)
}

async function pullOrdersSafe(fid) {
  try {
    const rows = await fetchOrdersForFamily(fid)
    await replaceTableRows('orders', rows)
    familySyncBus.ordersRev++
  } catch (e) {
    console.warn('[realtime] orders', e?.message ?? e)
  }
}

async function pullDishesSafe(fid) {
  try {
    const rows = await fetchDishesForFamily(fid)
    await replaceTableRows('dishes', rows)
    familySyncBus.dishesRev++
  } catch (e) {
    console.warn('[realtime] dishes', e?.message ?? e)
  }
}

async function pullCatsSafe(fid) {
  try {
    const rows = await fetchCategoriesForFamily(fid)
    await replaceTableRows('categories', rows)
    familySyncBus.categoriesRev++
  } catch (e) {
    console.warn('[realtime] categories', e?.message ?? e)
  }
}

function teardownChannel() {
  clearTimeout(tOrders)
  clearTimeout(tDishes)
  clearTimeout(tCats)
  tOrders = tDishes = tCats = null
  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
  subscribedFamilyId = null
}

/**
 * 按当前登录态与家庭 ID 订阅 Realtime；无云/未登录/无家庭则退订。
 * 需在 Supabase 为 orders/dishes/categories 打开 Realtime（见 migrations）。
 */
export async function syncFamilyRealtimeSubscription(familyId) {
  if (!cloudEnabled()) {
    teardownChannel()
    return
  }
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || !familyId) {
    teardownChannel()
    return
  }
  if (subscribedFamilyId === familyId && channel) return

  teardownChannel()
  subscribedFamilyId = familyId

  const filter = `family_id=eq.${familyId}`
  const topic = `family:${familyId}`

  channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter },
      () => scheduleOrdersPull(familyId),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'dishes', filter },
      () => scheduleDishesPull(familyId),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter },
      () => scheduleCatsPull(familyId),
    )
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[realtime]', status, err?.message ?? err ?? '')
      }
    })
}
