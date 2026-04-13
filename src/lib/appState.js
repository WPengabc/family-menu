import { reactive } from 'vue'
import { getFamilyId, getSession, restoreFamilyFromServer, syncProfileFromSession } from './familyApi'
import { syncFamilyRealtimeSubscription } from './realtimeFamily'
import { syncNow } from './sync'
import { supabase } from './supabase'
import { seedDemoDataIfEmpty } from './demoSeed'

export const appState = reactive({
  session: null,
  familyId: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  /** 最近一次完整同步拉下的行数（用于「我的」是否整页重载） */
  lastSyncPullCount: 0,
  toast: '',
  toastType: 'ok', // ok | err
  syncPhase: 'idle', // idle | queued | syncing | done | error
  queuedOps: 0,
})

function toast(msg, type = 'ok') {
  appState.toast = msg
  appState.toastType = type
  if (!msg) return
  setTimeout(() => {
    if (appState.toast === msg) appState.toast = ''
  }, 3500)
}

export async function initApp() {
  await seedDemoDataIfEmpty()
  await refreshAuth()
  await refreshFamily()

  // 登录后优先从云端恢复家庭归属，避免“同邮箱多端登录但看不到数据”
  if (appState.session && !appState.familyId) {
    try {
      const fid = await restoreFamilyFromServer()
      if (fid) appState.familyId = fid
    } catch (e) {
      // 不阻断：仍可离线使用
      toast(e?.message ?? '恢复家庭失败', 'err')
    }
  }

  supabase.auth.onAuthStateChange(async () => {
    await refreshAuth()
    await refreshFamily()
    if (appState.session && !appState.familyId) {
      try {
        const fid = await restoreFamilyFromServer()
        if (fid) appState.familyId = fid
      } catch (e) {
        toast(e?.message ?? '恢复家庭失败', 'err')
      }
    }
    if (appState.session && appState.familyId) {
      void queueSyncJob({ verboseSuccess: false })
    }
  })

  window.addEventListener('online', () => {
    appState.online = true
    if (appState.session && appState.familyId) void queueSyncJob({ verboseSuccess: false })
  })
  window.addEventListener('offline', () => {
    appState.online = false
    toast('当前离线：操作会先保存到本机，联网后自动同步', 'ok')
  })

  if (appState.session && appState.familyId) void queueSyncJob({ verboseSuccess: false })

  void syncFamilyRealtimeSubscription(appState.familyId)
}

/** 串行执行同步任务，避免多处同时触发导致交错与重复 Toast */
let syncJobChain = Promise.resolve()

function queueSyncJob(opts) {
  const job = syncJobChain.then(async () => {
    await runSyncInternal(opts)
  })
  syncJobChain = job.catch(() => {})
  return job
}

/**
 * 订单等：立刻把 oplog 推上云端，不做全量 pull（随后仍会由 scheduleBackgroundSync 做完整同步合并他人数据）
 */
export function queuePushOnlySync(familyId) {
  if (!familyId || appState.familyId !== familyId) return
  void queueSyncJob({ verboseSuccess: false, skipPull: true })
}

let backgroundDebounceTimer = null
const BACKGROUND_SYNC_DEBOUNCE_MS = 1200
const RECENT_REALTIME_WINDOW_MS = 2200
let lastRealtimePullAt = 0

/**
 * 编辑/下单后的后台同步：防抖合并多次操作，成功不弹窗（失败仍提示）
 */
export function scheduleBackgroundSync(familyId) {
  if (!familyId) return
  clearTimeout(backgroundDebounceTimer)
  backgroundDebounceTimer = setTimeout(() => {
    backgroundDebounceTimer = null
    if (!appState.familyId || appState.familyId !== familyId) return
    const justPulledByRealtime = Date.now() - lastRealtimePullAt < RECENT_REALTIME_WINDOW_MS
    // Realtime 已拉到最新时，避免立刻再做一次全量 pull。
    void queueSyncJob({ verboseSuccess: false, skipPull: justPulledByRealtime })
  }, BACKGROUND_SYNC_DEBOUNCE_MS)
}

async function runSyncInternal({ verboseSuccess, reason, skipPull = false }) {
  if (!appState.familyId || !appState.session) return null
  try {
    appState.syncPhase = 'syncing'
    appState.syncing = true
    const r = await syncNow(appState.familyId, { skipPull })
    appState.lastSyncPullCount = r && typeof r.pulled === 'number' ? r.pulled : 0
    appState.queuedOps = Math.max(0, appState.queuedOps - Number(r?.pushed ?? 0))
    appState.syncPhase = appState.queuedOps > 0 ? 'queued' : 'done'
    if (verboseSuccess) {
      if (r.offline) {
        toast('当前离线：已保存在本机，联网后将自动同步', 'ok')
      } else if (!r.cloudDisabled) {
        const suffix = r.failed ? `，失败 ${r.failed}` : ''
        toast(`同步完成：上传 ${r.pushed} / 拉取 ${r.pulled}${suffix}${reason ? `（${reason}）` : ''}`, r.failed ? 'err' : 'ok')
      }
    }
    if (appState.syncPhase === 'done') {
      setTimeout(() => {
        if (!appState.syncing && appState.syncPhase === 'done') appState.syncPhase = 'idle'
      }, 1200)
    }
    return r
  } catch (e) {
    const msg = e?.message || e?.error_description || '同步失败'
    const extra = [e?.code, e?.details, e?.hint].filter(Boolean).join(' / ')
    toast(extra ? `${msg}（${extra}）` : msg, 'err')
    appState.syncPhase = 'error'
    throw e
  } finally {
    appState.syncing = false
  }
}

/**
 * 仅恢复 session + 本地 familyId，不请求 Supabase profiles。
 * 路由守卫必须用此函数，避免网络卡住导致无法进入「我的」。
 */
export async function refreshSessionAndFamilyFast() {
  let session = await getSession()
  if (!session) {
    await new Promise((r) => setTimeout(r, 80))
    session = await getSession()
  }
  appState.session = session
  appState.familyId = await getFamilyId()
}

export async function refreshAuth() {
  await refreshSessionAndFamilyFast()
  if (appState.session) {
    try {
      await syncProfileFromSession()
    } catch {
      /* 未配置 Supabase 或尚无 profiles 表时不阻断 */
    }
  }
  void syncFamilyRealtimeSubscription(appState.familyId)
}

export async function refreshFamily() {
  appState.familyId = await getFamilyId()
  void syncFamilyRealtimeSubscription(appState.familyId)
}

/** 用户主动点击「手动同步」：显示结果摘要，并取消待执行的后台防抖任务避免连跑两次 */
export function runSync(reason = '手动同步') {
  clearTimeout(backgroundDebounceTimer)
  backgroundDebounceTimer = null
  return queueSyncJob({ verboseSuccess: true, reason })
}

export function showError(e) {
  const msg = e?.message || e?.error_description || '操作失败'
  const extra = [e?.code, e?.details, e?.hint].filter(Boolean).join(' / ')
  toast(extra ? `${msg}（${extra}）` : msg, 'err')
}

export function showOk(msg) {
  toast(msg, 'ok')
}

export function markSyncQueued() {
  appState.queuedOps += 1
  if (!appState.syncing) appState.syncPhase = 'queued'
}

export function markRealtimePull() {
  lastRealtimePullAt = Date.now()
}

