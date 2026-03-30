import { reactive } from 'vue'
import { getFamilyId, getSession, restoreFamilyFromServer } from './familyApi'
import { syncNow } from './sync'
import { supabase } from './supabase'
import { seedDemoDataIfEmpty } from './demoSeed'

export const appState = reactive({
  session: null,
  familyId: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  toast: '',
  toastType: 'ok', // ok | err
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
      void runSync('登录状态变化后自动同步')
    }
  })

  window.addEventListener('online', () => {
    appState.online = true
    if (appState.session && appState.familyId) void runSync('联网后自动同步')
  })
  window.addEventListener('offline', () => {
    appState.online = false
    toast('当前离线：操作会先保存到本机，联网后自动同步', 'ok')
  })

  if (appState.session && appState.familyId) void runSync('启动时自动同步')
}

export async function refreshAuth() {
  appState.session = await getSession()
}

export async function refreshFamily() {
  appState.familyId = await getFamilyId()
}

export async function runSync(reason = '') {
  if (!appState.familyId) return
  if (!appState.session) return
  try {
    appState.syncing = true
    const r = await syncNow(appState.familyId)
    if (r.offline) {
      toast('当前离线：已保存到本机，联网后会自动同步', 'ok')
    } else {
      toast(`同步完成：上传 ${r.pushed} / 拉取 ${r.pulled}${reason ? `（${reason}）` : ''}`, 'ok')
    }
  } catch (e) {
    const msg =
      e?.message ||
      e?.error_description ||
      '同步失败'
    const extra = [e?.code, e?.details, e?.hint].filter(Boolean).join(' / ')
    toast(extra ? `${msg}（${extra}）` : msg, 'err')
  } finally {
    appState.syncing = false
  }
}

export function showError(e) {
  const msg = e?.message || e?.error_description || '操作失败'
  const extra = [e?.code, e?.details, e?.hint].filter(Boolean).join(' / ')
  toast(extra ? `${msg}（${extra}）` : msg, 'err')
}

export function showOk(msg) {
  toast(msg, 'ok')
}

