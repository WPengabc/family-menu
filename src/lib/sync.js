import { getOrCreateDeviceId, getSession } from './familyApi'
import { oplogListPending, oplogMarkSynced, listAll, replaceFamilyPullData } from './localDb'
import { cloudEnabled, deleteCategory, deleteOrder, fetchAll, upsertCategory, upsertDish, upsertOrder } from './cloudRepo'
import { supabase } from './supabase'

const DEFAULT_CATEGORY_ID = 'cat_home'

export async function syncNow(familyId) {
  if (!familyId) return { pushed: 0, pulled: 0 }

  // 没网就直接跳过（不抛错，避免打扰家人）
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { pushed: 0, pulled: 0, offline: true }
  }

  const session = await getSession()
  if (!session) return { pushed: 0, pulled: 0 }

  // 未配置 Supabase：仅本地演示
  if (!cloudEnabled()) return { pushed: 0, pulled: 0, cloudDisabled: true }

  const deviceId = await getOrCreateDeviceId()

  // 如果云端这个家庭还没有数据，把本机的演示数据/已编辑数据先灌进去
  await ensureCloudSeed({ familyId })

  const pushed = await pushPendingOps({ familyId, deviceId })
  const pulled = await pullRemoteState({ familyId })
  return { pushed, pulled }
}

async function ensureCloudSeed({ familyId }) {
  const [cats, dishes, orders] = await Promise.all([
    supabase.from('categories').select('id').eq('family_id', familyId).limit(1),
    supabase.from('dishes').select('id').eq('family_id', familyId).limit(1),
    supabase.from('orders').select('id').eq('family_id', familyId).limit(1),
  ])

  if (cats.error) throw cats.error
  if (dishes.error) throw dishes.error
  if (orders.error) throw orders.error

  const cloudEmpty = (cats.data?.length ?? 0) === 0 && (dishes.data?.length ?? 0) === 0 && (orders.data?.length ?? 0) === 0
  if (!cloudEmpty) return

  const [localCats, localDishes, localOrders] = await Promise.all([
    listAll('categories'),
    listAll('dishes'),
    listAll('orders'),
  ])

  if (localCats.length) {
    const payload = localCats.map((c) => ({ ...c, family_id: familyId }))
    const { error } = await supabase.from('categories').upsert(payload, { onConflict: 'id' })
    if (error) throw error
  }

  if (localDishes.length) {
    const payload = localDishes.map((d) => ({ ...d, family_id: familyId }))
    const { error } = await supabase.from('dishes').upsert(payload, { onConflict: 'id' })
    if (error) throw error
  }

  if (localOrders.length) {
    const payload = localOrders.map((o) => ({ ...o, family_id: familyId }))
    const { error } = await supabase.from('orders').upsert(payload, { onConflict: 'id' })
    if (error) throw error
  }
}

async function pushPendingOps({ familyId, deviceId }) {
  const pending = await oplogListPending(50)
  if (pending.length === 0) return 0

  for (const op of pending) {
    // 同步只处理当前设备产生的变更
    if (op.deviceId && op.deviceId !== deviceId) continue
    await applyOpToCloud({ familyId, op })
  }

  await oplogMarkSynced(pending.map((x) => x.id))
  return pending.length
}

async function pullRemoteState({ familyId }) {
  const remote = await fetchAll({ familyId })

  // 单事务替换，避免清空与写入之间其它 Tab/页面读到空菜品库
  await replaceFamilyPullData({
    categories: remote.categories,
    dishes: remote.dishes,
    orders: remote.orders,
  })
  return remote.categories.length + remote.dishes.length + remote.orders.length
}

async function applyOpToCloud({ familyId, op }) {
  const t = op.opType
  const p = op.payload ?? {}

  if (t === 'upsert_category') return await upsertCategory({ familyId, row: p.row })
  if (t === 'delete_category') {
    // 删除分类：把该分类下菜品迁移到默认分类，再删除分类
    // （保持与本地 deleteCategoryLocal 的体验一致）
    const { error } = await supabase
      .from('dishes')
      .update({ category_id: DEFAULT_CATEGORY_ID })
      .eq('family_id', familyId)
      .eq('category_id', p.id)
    if (error) throw error
    return await deleteCategory({ familyId, id: p.id })
  }
  if (t === 'upsert_dish') return await upsertDish({ familyId, row: p.row })
  if (t === 'upsert_order') return await upsertOrder({ familyId, row: p.row })
  if (t === 'delete_order') return await deleteOrder({ familyId, id: p.id })

  // 未识别操作：忽略，避免阻断家庭使用
}

