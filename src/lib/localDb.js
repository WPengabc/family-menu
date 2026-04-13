import { openDB } from 'idb'

const DB_NAME = 'family-menu'
const DB_VERSION = 1

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('oplog')) db.createObjectStore('oplog', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('dishes')) db.createObjectStore('dishes', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id' })
    },
  })
}

export async function metaGet(key) {
  const db = await getDb()
  const row = await db.get('meta', key)
  return row?.value ?? null
}

export async function metaSet(key, value) {
  const db = await getDb()
  await db.put('meta', { key, value })
}

export async function oplogAdd(entry) {
  const db = await getDb()
  await db.put('oplog', entry)
}

export async function oplogListPending(limit = 50) {
  const db = await getDb()
  const all = await db.getAll('oplog')
  // 简化：按 createdAt 排序，优先同步最早的
  return all
    .filter((x) => x.status !== 'synced')
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .slice(0, limit)
}

export async function oplogMarkSynced(ids) {
  if (!ids?.length) return
  const db = await getDb()
  const tx = db.transaction('oplog', 'readwrite')
  for (const id of ids) {
    const row = await tx.store.get(id)
    if (row) await tx.store.put({ ...row, status: 'synced', syncedAt: Date.now() })
  }
  await tx.done
}

export async function oplogMarkFailed(id, errorMessage) {
  if (!id) return
  const db = await getDb()
  const row = await db.get('oplog', id)
  if (!row) return
  await db.put('oplog', {
    ...row,
    status: 'pending',
    lastError: String(errorMessage ?? '同步失败'),
    lastTriedAt: Date.now(),
    retryCount: Number(row.retryCount ?? 0) + 1,
  })
}

export async function oplogDeleteOldSynced({ olderThanMs = 3 * 24 * 60 * 60 * 1000, limit = 200 } = {}) {
  const db = await getDb()
  const all = await db.getAll('oplog')
  const now = Date.now()
  const candidates = all
    .filter((x) => x.status === 'synced' && (x.syncedAt ?? 0) > 0 && now - x.syncedAt > olderThanMs)
    .sort((a, b) => (a.syncedAt ?? 0) - (b.syncedAt ?? 0))
    .slice(0, Math.max(0, limit))
  if (candidates.length === 0) return 0

  const tx = db.transaction('oplog', 'readwrite')
  for (const row of candidates) await tx.store.delete(row.id)
  await tx.done
  return candidates.length
}

export async function upsertMany(storeName, rows) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readwrite')
  for (const r of rows) await tx.store.put(r)
  await tx.done
}

export async function listAll(storeName) {
  const db = await getDb()
  return await db.getAll(storeName)
}

export async function getOne(storeName, id) {
  const db = await getDb()
  return await db.get(storeName, id)
}

export async function putOne(storeName, row) {
  const db = await getDb()
  await db.put(storeName, row)
}

export async function deleteOne(storeName, id) {
  const db = await getDb()
  await db.delete(storeName, id)
}

export async function clearStore(storeName) {
  const db = await getDb()
  await db.clear(storeName)
}

/** 单表整表替换（与全量 pull 中的单表语义一致） */
export async function replaceTableRows(storeName, rows) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readwrite')
  await tx.store.clear()
  for (const r of rows) await tx.store.put(r)
  await tx.done
}

/**
 * 拉取云端后一次性替换三个表，避免「先 clear 再写入」分事务导致其它页面读到空库。
 */
export async function replaceFamilyPullData({ categories = [], dishes = [], orders = [] }) {
  const db = await getDb()
  const tx = db.transaction(['categories', 'dishes', 'orders'], 'readwrite')
  const cat = tx.objectStore('categories')
  await cat.clear()
  for (const r of categories) await cat.put(r)
  const dish = tx.objectStore('dishes')
  await dish.clear()
  for (const r of dishes) await dish.put(r)
  const ord = tx.objectStore('orders')
  await ord.clear()
  for (const r of orders) await ord.put(r)
  await tx.done
}

