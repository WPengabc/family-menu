import { supabase } from './supabase'

const BUCKET = 'dish-images'

export function cloudEnabled() {
  // 简单判断：没配置 env 就当作“仅本地演示”
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export async function fetchAll({ familyId }) {
  const [cats, dishes, orders] = await Promise.all([
    supabase.from('categories').select('*').eq('family_id', familyId),
    supabase.from('dishes').select('*').eq('family_id', familyId),
    supabase.from('orders').select('*').eq('family_id', familyId),
  ])
  if (cats.error) throw cats.error
  if (dishes.error) throw dishes.error
  if (orders.error) throw orders.error
  return {
    categories: cats.data ?? [],
    dishes: dishes.data ?? [],
    orders: orders.data ?? [],
  }
}

/** Realtime 增量：只拉一张表 */
export async function fetchOrdersForFamily(familyId) {
  const { data, error } = await supabase.from('orders').select('*').eq('family_id', familyId)
  if (error) throw error
  return data ?? []
}

export async function fetchDishesForFamily(familyId) {
  const { data, error } = await supabase.from('dishes').select('*').eq('family_id', familyId)
  if (error) throw error
  return data ?? []
}

export async function fetchCategoriesForFamily(familyId) {
  const { data, error } = await supabase.from('categories').select('*').eq('family_id', familyId)
  if (error) throw error
  return data ?? []
}

export async function upsertCategory({ familyId, row }) {
  const payload = { ...row, family_id: familyId }
  const { error } = await supabase.from('categories').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteCategory({ familyId, id }) {
  const { error } = await supabase.from('categories').delete().eq('family_id', familyId).eq('id', id)
  if (error) throw error
}

export async function upsertDish({ familyId, row }) {
  // 避免把 base64/本地字段直接塞进数据库
  const payload = {
    id: row.id,
    name: row.name,
    category_id: row.category_id ?? null,
    ingredients_text: row.ingredients_text ?? '',
    image_path: row.image_path ?? null,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
    family_id: familyId,
  }
  const { error } = await supabase.from('dishes').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

export async function upsertOrder({ familyId, row }) {
  const payload = {
    id: row.id,
    status: row.status,
    dish_ids: row.dish_ids ?? [],
    snapshot_dishes: row.snapshot_dishes ?? [],
    created_at: row.created_at,
    completed_at: row.completed_at ?? null,
    updated_at: row.updated_at,
    family_id: familyId,
    created_by_user_id: row.created_by_user_id ?? null,
    placed_by_label: row.placed_by_label ?? null,
  }
  const { error } = await supabase.from('orders').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteOrder({ familyId, id }) {
  const { error } = await supabase.from('orders').delete().eq('family_id', familyId).eq('id', id)
  if (error) throw error
}

export function dishImagePath({ familyId, dishId }) {
  return `${familyId}/${dishId}.jpg`
}

export async function uploadDishImage({ familyId, dishId, blob }) {
  const path = dishImagePath({ familyId, dishId })
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (error) throw error
  return path
}

const signedUrlCache = new Map()
const SIGNED_URL_CACHE_MAX = 180

function setSignedUrlCache(path, value) {
  if (signedUrlCache.has(path)) signedUrlCache.delete(path)
  signedUrlCache.set(path, value)
  if (signedUrlCache.size <= SIGNED_URL_CACHE_MAX) return
  const oldestKey = signedUrlCache.keys().next().value
  if (oldestKey) signedUrlCache.delete(oldestKey)
}

export async function getSignedDishImageUrl(path, ttlSeconds = 60 * 60) {
  if (!path) return ''
  const now = Date.now()
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt > now + 10_000) {
    setSignedUrlCache(path, cached)
    return cached.url
  }

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds)
  if (error) throw error
  const url = data?.signedUrl ?? ''
  setSignedUrlCache(path, { url, expiresAt: now + ttlSeconds * 1000 })
  return url
}

