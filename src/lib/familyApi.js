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

