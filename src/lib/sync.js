import { getOrCreateDeviceId, getSession } from './familyApi'
import {
  oplogDeleteOldSynced,
  oplogListPending,
  oplogMarkFailed,
  oplogMarkSynced,
  listAll,
  replaceFamilyPullData,
} from './localDb'
import { cloudEnabled, deleteCategory, deleteOrder, fetchAll, upsertCategory, upsertDish, upsertOrder } from './cloudRepo'
import { supabase } from './supabase'

const DEFAULT_CATEGORY_ID = 'cat_home'

/**
 * @param {string} familyId
 * @param {{ skipPull?: boolean }} [options] skipPull=true 时只上传待处理 oplog，不拉取全量（订单等可立刻写库，少一次大卡的全表替换）
 */
export async function syncNow(familyId, options = {}) {
  const skipPull = !!options.skipPull
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

  const pushResult = await pushPendingOps({ familyId, deviceId })
  let pulled = 0
  if (!skipPull) {
    pulled = await pullRemoteState({ familyId })
  }
  return {
    pushed: pushResult.pushed,
    skipped: pushResult.skipped,
    failed: pushResult.failed,
    pulled,
  }
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
  if (pending.length === 0) return { pushed: 0, failed: 0, skipped: 0 }

  const syncedIds = []
  let pushed = 0
  let failed = 0
  let skipped = 0
  let fatalError = null

  for (const op of pending) {
    // 同步只处理当前设备产生的变更
    if (op.deviceId && op.deviceId !== deviceId) {
      skipped += 1
      continue
    }
    try {
      await applyOpToCloud({ familyId, op })
      pushed += 1
      syncedIds.push(op.id)
    } catch (e) {
      failed += 1
      await oplogMarkFailed(op.id, classifySyncError(e))
      if (isFatalSyncError(e)) {
        fatalError = e
        break
      }
    }
  }

  await oplogMarkSynced(syncedIds)
  // 定期清理旧的已同步操作，避免 oplog 长期线性增长。
  if (syncedIds.length > 0) {
    await oplogDeleteOldSynced({ olderThanMs: 3 * 24 * 60 * 60 * 1000, limit: 120 })
  }
  if (fatalError) throw fatalError
  return { pushed, failed, skipped }
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

function isFatalSyncError(e) {
  const code = String(e?.code ?? '')
  const status = Number(e?.status ?? e?.statusCode ?? 0)
  const msg = String(e?.message ?? '')
  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === '403' ||
    code === 'PGRST301' ||
    msg.includes('JWT') ||
    msg.includes('not authenticated') ||
    msg.includes('permission denied') ||
    msg.includes('row-level security')
  )
}

function classifySyncError(e) {
  const msg = String(e?.message ?? '同步失败')
  if (isFatalSyncError(e)) return `鉴权失败：${msg}`
  const code = String(e?.code ?? '')
  const status = Number(e?.status ?? e?.statusCode ?? 0)
  if (status >= 500 || code.startsWith('5')) return `服务暂时不可用：${msg}`
  if (status === 408 || msg.includes('timeout') || msg.includes('network')) return `网络异常：${msg}`
  if (code === '23505' || code === '409') return `数据冲突：${msg}`
  return `业务错误：${msg}`
}

export const __syncInternals = {
  isFatalSyncError,
  classifySyncError,
}

