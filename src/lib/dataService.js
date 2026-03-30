import { deleteOne, getOne, listAll, putOne, upsertMany } from './localDb'
import { genId, nowIso, simplifyIngredients } from './utils'
import { queueOp, getSession } from './familyApi'
import { syncNow } from './sync'

function sortByUpdatedAtDesc(a, b) {
  return String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))
}

export async function getCategories() {
  const all = await listAll('categories')
  return all.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
}

export async function addCategoryLocal(name) {
  const now = nowIso()
  const row = { id: genId('C'), name: name.trim(), is_default: false, sort: 999, updated_at: now }
  await putOne('categories', row)
  return row
}

export async function renameCategoryLocal(id, name) {
  const row = await getOne('categories', id)
  if (!row) throw new Error('分类不存在')
  const updated = { ...row, name: name.trim(), updated_at: nowIso() }
  await putOne('categories', updated)
  return updated
}

export async function deleteCategoryLocal(id) {
  // 删除分类：把菜品迁移到“家常菜”
  const home = (await listAll('categories')).find((c) => c.name === '家常菜')?.id
  const dishes = await listAll('dishes')
  const moved = dishes.map((d) => (d.category_id === id ? { ...d, category_id: home ?? null, updated_at: nowIso() } : d))
  await upsertMany('dishes', moved)
  await deleteOne('categories', id)
}

export async function getDishes({ categoryId = 'all' } = {}) {
  const all = (await listAll('dishes')).filter((d) => !d.deleted_at)
  const filtered = categoryId === 'all' ? all : all.filter((d) => d.category_id === categoryId)
  return filtered.sort(sortByUpdatedAtDesc)
}

export async function getDish(id) {
  return await getOne('dishes', id)
}

export async function upsertDishLocal(dish) {
  const now = nowIso()
  const row = {
    id: dish.id ?? genId('D'),
    name: dish.name.trim(),
    category_id: dish.category_id ?? null,
    ingredients_text: dish.ingredients_text ?? '',
    image_path: dish.image_path ?? null, // demo: 可放 dataURL；生产建议用 storage path
    updated_at: now,
    deleted_at: null,
  }
  await putOne('dishes', row)
  return row
}

export async function deleteDishLocal(id) {
  const d = await getOne('dishes', id)
  if (!d) return
  const updated = { ...d, deleted_at: nowIso(), updated_at: nowIso() }
  await putOne('dishes', updated)
  return updated
}

export async function listOrders() {
  const all = await listAll('orders')
  // 未完成置顶
  return all.sort((a, b) => {
    if (a.status !== b.status) return a.status === '未完成' ? -1 : 1
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  })
}

export async function createOrderLocal(dishes) {
  const createdAt = nowIso()
  const id = `O${Date.now()}`
  const dishIds = dishes.map((d) => d.id)
  const snapshot = dishes.map((d) => ({
    dish_id: d.id,
    name: d.name,
    category_id: d.category_id,
    image_path: d.image_path ?? null,
    simple_ingredients: simplifyIngredients(d.ingredients_text),
  }))
  const row = {
    id,
    status: '未完成',
    dish_ids: dishIds,
    snapshot_dishes: snapshot,
    created_at: createdAt,
    completed_at: null,
    updated_at: createdAt,
  }
  await putOne('orders', row)
  return row
}

export async function completeOrderLocal(orderId) {
  const o = await getOne('orders', orderId)
  if (!o) throw new Error('订单不存在')
  if (o.status === '已完成') return o
  const now = nowIso()
  const updated = { ...o, status: '已完成', completed_at: now, updated_at: now }
  await putOne('orders', updated)
  return updated
}

export async function deleteOrderLocal(orderId) {
  await deleteOne('orders', orderId)
}

// ====== 联网互通：把本地操作入队（离线也可），同步模块会 flush ======
export async function enqueueCloudOp({ familyId, opType, entityId, payload }) {
  if (!familyId) return
  await queueOp({ familyId, opType, entityId, payload })

  // 让“家庭互通”更像真的：有网就尽快同步，不强依赖用户手动点按钮
  try {
    const session = await getSession()
    if (session && typeof navigator !== 'undefined' && navigator.onLine) {
      void syncNow(familyId)
    }
  } catch {
    // 静默失败：不影响本地使用
  }
}

