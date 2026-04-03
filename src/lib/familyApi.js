import { supabase } from './supabase'
import { metaGet, metaSet, oplogAdd } from './localDb'

const META_FAMILY_ID = 'familyId'
const META_DEVICE_ID = 'deviceId'
const META_FAMILY_INFO = 'familyInfo'

export async function getOrCreateDeviceId() {
  let id = await metaGet(META_DEVICE_ID)
  if (id) return id
  id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  await metaSet(META_DEVICE_ID, id)
  return id
}

export async function getFamilyId() {
  return await metaGet(META_FAMILY_ID)
}

export async function setFamilyId(familyId) {
  await metaSet(META_FAMILY_ID, familyId)
}

export async function getFamilyInfo() {
  return await metaGet(META_FAMILY_INFO)
}

export async function refreshFamilyInfo() {
  const familyId = await getFamilyId()
  if (!familyId) {
    await metaSet(META_FAMILY_INFO, null)
    return null
  }

  const session = await getSession()
  if (!session) return null

  const { data: fam, error } = await supabase
    .from('families')
    .select('id, name, invite_code')
    .eq('id', familyId)
    .maybeSingle()
  if (error) throw error

  await metaSet(META_FAMILY_INFO, fam ?? null)
  return fam ?? null
}

function randomInviteCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
}

export async function signInWithOtp(email) {
  const emailRedirectTo =
    typeof window === 'undefined'
      ? undefined
      : `${window.location.origin}/me`

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  await setFamilyId(null)
  await metaSet(META_FAMILY_INFO, null)
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

/** 当前用户在 profiles 中的展示字段（无表或未配置时返回 null） */
export async function getMyProfile() {
  const session = await getSession()
  if (!session?.user?.id) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', session.user.id)
    .maybeSingle()
  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('profiles') && (msg.includes('does not exist') || msg.includes('schema cache'))) return null
    throw error
  }
  return data ?? null
}

/** 更新昵称（家庭成员列表优先显示）；空字符串表示清除昵称 */
export async function updateMyDisplayName(displayName) {
  const session = await getSession()
  if (!session?.user?.id) throw new Error('未登录')
  const trimmed = (displayName ?? '').trim().slice(0, 32)
  const display_name = trimmed.length ? trimmed : null
  const email = session.user.email ?? null
  const now = new Date().toISOString()
  const { error } = await supabase.from('profiles').upsert(
    { id: session.user.id, email, display_name, updated_at: now },
    { onConflict: 'id' },
  )
  if (error) throw error
}

/** 把当前登录用户的邮箱写入 profiles；保留已有 display_name，避免覆盖昵称 */
export async function syncProfileFromSession() {
  const session = await getSession()
  if (!session?.user?.id) return
  const id = session.user.id
  const email = session.user.email ?? null
  const now = new Date().toISOString()

  const { data: row, error: selErr } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', id)
    .maybeSingle()

  if (selErr) {
    const msg = String(selErr.message ?? '')
    if (msg.includes('profiles') && (msg.includes('does not exist') || msg.includes('schema cache'))) return
    console.warn('[profiles] syncProfileFromSession:', selErr.message ?? selErr)
    return
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      id,
      email,
      display_name: row?.display_name ?? null,
      updated_at: now,
    },
    { onConflict: 'id' },
  )
  if (error) {
    const msg = String(error.message ?? '')
    if (msg.includes('profiles') && (msg.includes('does not exist') || msg.includes('schema cache'))) return
    console.warn('[profiles] syncProfileFromSession:', error.message ?? error)
  }
}

export async function createFamily({ name }) {
  // 简化：客户端生成 6 位邀请码，冲突则重试（家庭规模下够用）
  // 更严谨的做法：用 RPC/Edge Function 在服务端生成并原子创建。
  let lastErr = null
  for (let i = 0; i < 5; i++) {
    const invite_code = randomInviteCode()
    const { data, error } = await supabase
      .from('families')
      .insert([{ name: name?.trim() || '我的家庭', invite_code }])
      .select('id, invite_code')
      .single()
    if (!error) {
      // 把当前用户加入该家庭（RLS 允许 user_id = auth.uid()）
      const session = await getSession()
      const { error: e2 } = await supabase
        .from('family_members')
        .insert([{ family_id: data.id, user_id: session.user.id, role: 'owner' }])
      if (e2) throw e2

      await setFamilyId(data.id)
      await refreshFamilyInfo()
      return data
    }
    lastErr = error
  }
  throw lastErr ?? new Error('创建家庭失败')
}

export async function joinFamilyByInviteCode(inviteCode) {
  const code = String(inviteCode ?? '').trim()
  if (!/^\d{6}$/.test(code)) throw new Error('邀请码需要 6 位数字')

  // 先查家庭
  const { data: fam, error } = await supabase
    .from('families')
    .select('id, invite_code, name')
    .eq('invite_code', code)
    .maybeSingle()
  if (error) throw error
  if (!fam) throw new Error('邀请码无效')

  // 再加入家庭
  const session = await getSession()
  const { error: e2 } = await supabase
    .from('family_members')
    .insert([{ family_id: fam.id, user_id: session.user.id, role: 'member' }])
  // 23505：已存在 (family_id, user_id) 唯一键冲突，视为“已加入”
  if (e2 && e2.code !== '23505') throw e2

  await setFamilyId(fam.id)
  await refreshFamilyInfo()
  return fam
}

/**
 * 列出当前家庭成员；合并 profiles 的邮箱/昵称（需执行 migrations 里 profiles 的 SQL）。
 */
export async function listFamilyMembers(familyId) {
  if (!familyId) return []
  const { data, error } = await supabase
    .from('family_members')
    .select('user_id, role, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  if (ids.length === 0) return []

  const { data: profs, error: pe } = await supabase
    .from('profiles')
    .select('id, email, display_name')
    .in('id', ids)

  const byId = {}
  if (!pe && profs) {
    for (const p of profs) byId[p.id] = p
  }

  return rows.map((r) => ({
    user_id: r.user_id,
    role: r.role,
    created_at: r.created_at,
    email: byId[r.user_id]?.email ?? null,
    display_name: byId[r.user_id]?.display_name ?? null,
  }))
}

export async function restoreFamilyFromServer() {
  const session = await getSession()
  if (!session) return null

  // 不依赖本机缓存：从 family_members 查询当前用户的家庭
  const { data, error } = await supabase
    .from('family_members')
    .select('family_id, role, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) throw error
  const rows = data ?? []
  if (rows.length === 0) return null

  // 优先 owner，否则取最早加入的家庭（简单策略）
  const owner = rows.find((r) => r.role === 'owner')
  const familyId = (owner?.family_id ?? rows[0].family_id) || null
  if (!familyId) return null

  await setFamilyId(familyId)
  await refreshFamilyInfo()
  return familyId
}

export async function queueOp({ familyId, opType, entityId, payload }) {
  const session = await getSession()
  if (!session) return null
  if (!familyId) return null
  const deviceId = await getOrCreateDeviceId()
  const entry = {
    id: crypto?.randomUUID?.() ?? `op_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    familyId,
    userId: session.user.id,
    deviceId,
    opType,
    entityId: entityId ?? null,
    payload: payload ?? {},
    createdAt: Date.now(),
    status: 'pending',
  }
  await oplogAdd(entry)
  return entry
}

