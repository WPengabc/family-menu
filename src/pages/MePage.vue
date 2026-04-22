<script setup>
defineOptions({ name: 'MePage' })
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { appState, refreshAuth, refreshFamily, runSync, showError, showOk } from '../lib/appState'
import { familySyncBus } from '../lib/familySyncBus'
import {
  createFamily,
  getFamilyInfo,
  getMyProfile,
  joinFamilyByInviteCode,
  listFamilyMembers,
  refreshFamilyInfo,
  signInWithOtp,
  signOut,
  updateMyDisplayName,
  verifyEmailOtp,
} from '../lib/familyApi'
import {
  addCategoryLocal,
  deleteCategoryLocal,
  enqueueCloudOp,
  getCategories,
  getDishes,
  deleteDishLocal,
  renameCategoryLocal,
} from '../lib/dataService'
import DishEditorModalImpl from '../components/DishEditorModal.vue'
import DishThumb from '../components/DishThumb.vue'

const router = useRouter()
const route = useRoute()
const email = ref('')
const otpCode = ref('')
const otpSent = ref(false)
const familyName = ref('我的家庭')
const inviteCode = ref('')
const categories = ref([])
const dishes = ref([])
const familyInfo = ref(null)
const familyMembers = ref([])
const membersLoading = ref(false)
const nicknameInput = ref('')
const nicknameSaving = ref(false)

const showEditor = ref(false)
const editingDishId = ref(null)

const familyCollapse = ref(['family'])
const categoryCollapse = ref([])

const textPromptConfig = ref({
  show: false,
  title: '',
  placeholder: '',
  value: '',
  maxLength: 32,
  confirmText: '确认',
  onConfirm: null,
})

const authed = computed(() => !!appState.session)
const inFamily = computed(() => !!appState.familyId)
const dishCount = computed(() => dishes.value.length)
const inviteCodeText = computed(() => familyInfo.value?.invite_code ?? '')

const profilePrimary = computed(() => {
  if (!authed.value) return '未登录'
  const nick = nicknameInput.value.trim()
  if (nick) return nick
  return appState.session?.user?.email ?? '已登录'
})

const profileSecondary = computed(() => {
  if (!authed.value) return '数据仅保存在本机'
  const email = appState.session?.user?.email
  if (email && email !== profilePrimary.value) return email
  return inFamily.value ? '家庭已同步' : '仅本机（未加入家庭）'
})

const profileInitial = computed(() => {
  const src = profilePrimary.value
  if (!src || src === '未登录') return ''
  const ch = src.trim().charAt(0)
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ch
})

function dishCategoryName(dish) {
  const c = categories.value.find((x) => x.id === dish.category_id)
  return c?.name ?? '未分类'
}

function shortUserId(uid) {
  const s = String(uid ?? '')
  if (s.length <= 10) return s
  return `${s.slice(0, 8)}…`
}

function memberDisplayLine(m) {
  const name = (m.display_name ?? '').trim()
  if (name) return name
  if (m.email) return m.email
  if (m.user_id === appState.session?.user?.id && appState.session?.user?.email) {
    return appState.session.user.email
  }
  return shortUserId(m.user_id)
}

function openTextPrompt({ title, placeholder, value = '', maxLength = 32, confirmText = '确认', onConfirm }) {
  textPromptConfig.value = {
    show: true,
    title,
    placeholder,
    value,
    maxLength,
    confirmText,
    onConfirm,
  }
}

async function confirmTextPrompt() {
  const cfg = textPromptConfig.value
  const v = (cfg.value ?? '').trim()
  if (!v) return
  if (typeof cfg.onConfirm === 'function') {
    try {
      await cfg.onConfirm(v)
    } finally {
      textPromptConfig.value = { ...textPromptConfig.value, show: false }
    }
  } else {
    textPromptConfig.value = { ...textPromptConfig.value, show: false }
  }
}

async function loadFamilyMembers() {
  if (!appState.familyId || !authed.value) {
    familyMembers.value = []
    return
  }
  membersLoading.value = true
  try {
    familyMembers.value = await listFamilyMembers(appState.familyId)
  } catch (e) {
    showError(e)
    familyMembers.value = []
  } finally {
    membersLoading.value = false
  }
}

async function doRefreshInviteCode() {
  try {
    const x = await refreshFamilyInfo()
    familyInfo.value = x
    if (x?.invite_code) showOk('已加载邀请码')
  } catch (e) {
    showError(e)
  }
}

async function copyInviteCode() {
  if (!inviteCodeText.value) return
  try {
    await navigator.clipboard.writeText(inviteCodeText.value)
    showToast({ message: '已复制邀请码', position: 'bottom' })
  } catch {
    showError(new Error('复制失败：请检查浏览器权限或手动复制邀请码'))
  }
}

function openAdd() {
  editingDishId.value = null
  showEditor.value = true
}

function openEdit(id) {
  editingDishId.value = id
  showEditor.value = true
}

async function doSignIn() {
  try {
    await signInWithOtp(email.value.trim())
    otpSent.value = true
    showOk('验证码已发送，请在当前页面输入邮箱验证码完成登录')
  } catch (e) {
    showError(e)
  }
}

async function doVerifyOtp() {
  try {
    await verifyEmailOtp({ email: email.value, code: otpCode.value })
    await refreshAuth()
    await refreshFamily()
    otpCode.value = ''
    otpSent.value = false
    showOk('登录成功')
  } catch (e) {
    showError(e)
  }
}

async function refreshNicknameFromServer() {
  if (!authed.value) {
    nicknameInput.value = ''
    return
  }
  try {
    const row = await getMyProfile()
    nicknameInput.value = (row?.display_name ?? '').trim()
  } catch {
    nicknameInput.value = ''
  }
}

async function saveNickname() {
  nicknameSaving.value = true
  try {
    await updateMyDisplayName(nicknameInput.value)
    showOk('昵称已保存')
    if (inFamily.value && appState.familyId) await loadFamilyMembers()
  } catch (e) {
    showError(e)
  } finally {
    nicknameSaving.value = false
  }
}

async function doSignOut() {
  try {
    await showConfirmDialog({
      title: '退出登录',
      message: '确认退出当前账号？本地数据会保留。',
      confirmButtonText: '退出',
    })
  } catch {
    return
  }
  try {
    await signOut()
    await refreshAuth()
    await refreshFamily()
    nicknameInput.value = ''
    showOk('已退出登录')
  } catch (e) {
    showError(e)
  }
}

async function doCreateFamily() {
  try {
    const fam = await createFamily({ name: familyName.value })
    await refreshFamily()
    familyInfo.value = await refreshFamilyInfo()
    await loadFamilyMembers()
    showOk(`已创建家庭：邀请码 ${fam.invite_code}`)
  } catch (e) {
    showError(e)
  }
}

async function doJoinFamily() {
  try {
    const fam = await joinFamilyByInviteCode(inviteCode.value)
    await refreshFamily()
    familyInfo.value = await refreshFamilyInfo()
    await loadFamilyMembers()
    showOk(`已加入家庭：${fam.name}`)
  } catch (e) {
    showError(e)
  }
}

async function refreshCategories() {
  categories.value = await getCategories()
}

async function refreshDishes() {
  dishes.value = await getDishes({ categoryId: 'all' })
}

async function reloadMeLists() {
  await refreshCategories()
  await refreshDishes()
  familyInfo.value = await getFamilyInfo()
  if (authed.value && inFamily.value && !familyInfo.value) {
    try {
      familyInfo.value = await refreshFamilyInfo()
    } catch (e) {
      showError(e)
    }
  }
  if (authed.value && appState.familyId) await loadFamilyMembers()
}

async function delDish(d) {
  try {
    await showConfirmDialog({
      title: '删除菜品',
      message: `确认删除「${d.name}」？`,
      confirmButtonText: '删除',
      confirmButtonColor: 'var(--van-danger-color)',
    })
  } catch {
    return
  }
  try {
    const row = await deleteDishLocal(d.id)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_dish', entityId: d.id, payload: { row } })
    showOk('已删除（本机）')
    await refreshDishes()
  } catch (e) {
    showError(e)
  }
}

function addCategory() {
  openTextPrompt({
    title: '新增分类',
    placeholder: '例如：川菜 / 早餐',
    confirmText: '创建',
    maxLength: 12,
    async onConfirm(name) {
      try {
        const row = await addCategoryLocal(name)
        await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_category', entityId: row.id, payload: { row } })
        await refreshCategories()
        showOk('已新增分类（本机）')
      } catch (e) {
        showError(e)
      }
    },
  })
}

function renameCategory(c) {
  openTextPrompt({
    title: '重命名分类',
    placeholder: '请输入新名称',
    value: c.name,
    confirmText: '保存',
    maxLength: 12,
    async onConfirm(name) {
      try {
        const row = await renameCategoryLocal(c.id, name)
        await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_category', entityId: row.id, payload: { row } })
        await refreshCategories()
        showOk('已重命名（本机）')
      } catch (e) {
        showError(e)
      }
    },
  })
}

async function delCategory(c) {
  if (c.is_default) return
  try {
    await showConfirmDialog({
      title: '删除分类',
      message: `删除分类「${c.name}」？该分类下菜品会迁移到"家常菜"。`,
      confirmButtonText: '删除',
      confirmButtonColor: 'var(--van-danger-color)',
    })
  } catch {
    return
  }
  try {
    await deleteCategoryLocal(c.id)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'delete_category', entityId: c.id, payload: { id: c.id } })
    await refreshCategories()
    showOk('已删除分类（本机）')
  } catch (e) {
    showError(e)
  }
}

onMounted(async () => {
  await refreshAuth()
  await refreshFamily()
  await refreshNicknameFromServer()
  await reloadMeLists()
})

watch(
  () => appState.syncing,
  async (syncing, prevSyncing) => {
    if (!prevSyncing || syncing || route.path !== '/me') return
    if (appState.lastSyncPullCount > 0) await reloadMeLists()
  },
)

let meRemoteDebounce = null
watch(
  () => [familySyncBus.dishesRev, familySyncBus.categoriesRev],
  () => {
    if (route.path !== '/me') return
    clearTimeout(meRemoteDebounce)
    meRemoteDebounce = setTimeout(async () => {
      await refreshDishes()
      await refreshCategories()
    }, 200)
  },
)

watch(
  () => appState.session?.user?.id,
  async (id) => {
    if (id) await refreshNicknameFromServer()
    else nicknameInput.value = ''
  },
)
</script>

<template>
  <div class="wrap">
    <!-- 顶部 Profile 卡 -->
    <section class="hero" :class="{ heroAuthed: authed }">
      <div class="heroAvatar" :class="{ heroAvatarAuthed: authed }">
        <span v-if="profileInitial">{{ profileInitial }}</span>
        <van-icon v-else name="user-o" />
      </div>
      <div class="heroInfo">
        <div class="heroName" :class="{ muted: !authed }">{{ profilePrimary }}</div>
        <div class="heroSub">{{ profileSecondary }}</div>
      </div>
      <van-tag
        v-if="authed"
        round
        plain
        size="medium"
        :type="inFamily ? 'success' : 'warning'"
      >
        {{ inFamily ? '已加入家庭' : '未加入家庭' }}
      </van-tag>
    </section>

    <!-- 菜品库 -->
    <div class="section">
      <div class="sectionHeader">
        <h2>
          菜品库
          <span v-if="dishCount" class="countBadge">{{ dishCount }}</span>
        </h2>
        <van-button
          size="small"
          type="warning"
          round
          icon="plus"
          @click="openAdd"
        >
          添加
        </van-button>
      </div>

      <van-empty
        v-if="dishes.length === 0"
        image="search"
        description="暂无菜品，点击右上角「添加」开始"
      />

      <van-cell-group v-else inset class="dishGroup">
        <van-swipe-cell v-for="d in dishes" :key="d.id">
          <van-cell center :border="false" class="dishCell" @click="openEdit(d.id)">
            <template #icon>
              <DishThumb
                :imagePath="d.image_path"
                :alt="`${d.name} 图片`"
                :fallbackTitle="`${d.name} 暂无图片`"
                className="thumb"
              />
            </template>
            <template #title>
              <div class="dishName">{{ d.name }}</div>
            </template>
            <template #label>
              <div class="dishSub">{{ dishCategoryName(d) }}</div>
            </template>
            <template #right-icon>
              <van-icon name="edit" class="editIcon" />
            </template>
          </van-cell>
          <template #right>
            <van-button
              square
              type="danger"
              class="swipeBtn"
              text="删除"
              @click="delDish(d)"
            />
          </template>
        </van-swipe-cell>
      </van-cell-group>
    </div>

    <!-- 家庭互通 -->
    <van-collapse v-model="familyCollapse" class="neatCollapse">
      <van-collapse-item name="family">
        <template #title>
          <div class="neatCollapseTitle">
            <van-icon name="friends-o" />
            <span>家庭互通</span>
            <van-tag
              v-if="!authed"
              round
              plain
              size="medium"
              type="default"
            >
              未登录
            </van-tag>
            <van-tag
              v-else
              round
              plain
              size="medium"
              :type="inFamily ? 'success' : 'warning'"
            >
              {{ inFamily ? '已共享' : '未加入' }}
            </van-tag>
          </div>
        </template>

        <!-- 未登录 -->
        <div v-if="!authed" class="familyBody">
          <div class="bodyHint">输入邮箱后会收到验证码，输入验证码完成登录。</div>
          <van-cell-group inset>
            <van-field
              v-model="email"
              label="邮箱"
              placeholder="xxx@qq.com"
              type="email"
              clearable
            >
              <template #button>
                <van-button size="small" type="warning" round @click="doSignIn">
                  发送验证码
                </van-button>
              </template>
            </van-field>
            <van-field
              v-model="otpCode"
              label="验证码"
              placeholder="输入邮箱验证码"
              type="digit"
              maxlength="8"
              @keyup.enter="doVerifyOtp"
            >
              <template #button>
                <van-button
                  size="small"
                  round
                  :disabled="!otpCode.trim() || !email.trim()"
                  @click="doVerifyOtp"
                >
                  登录
                </van-button>
              </template>
            </van-field>
          </van-cell-group>
          <div v-if="otpSent" class="bodyHint muted">
            如果没收到，请检查垃圾邮箱后重新发送。
          </div>
        </div>

        <!-- 已登录 -->
        <div v-else class="familyBody">
          <!-- 昵称 -->
          <van-cell-group inset>
            <van-field
              v-model="nicknameInput"
              label="我的昵称"
              placeholder="例如：老爸、小张"
              maxlength="32"
            >
              <template #button>
                <van-button
                  size="small"
                  type="warning"
                  round
                  :loading="nicknameSaving"
                  @click="saveNickname"
                >
                  保存
                </van-button>
              </template>
            </van-field>
          </van-cell-group>
          <div class="bodyHint muted">留空则在家庭成员中显示邮箱。</div>

          <!-- 未加入家庭：创建 / 加入 -->
          <template v-if="!inFamily">
            <van-cell-group inset title="创建家庭">
              <van-field
                v-model="familyName"
                label="家庭名称"
                placeholder="家庭名称（可选）"
              />
              <div class="cellAction">
                <van-button type="warning" round block @click="doCreateFamily">
                  创建并生成邀请码
                </van-button>
              </div>
            </van-cell-group>

            <van-cell-group inset title="加入家庭">
              <van-field
                v-model="inviteCode"
                label="邀请码"
                placeholder="6位邀请码"
                type="digit"
                maxlength="6"
              />
              <div class="cellAction">
                <van-button type="warning" plain round block @click="doJoinFamily">
                  加入家庭
                </van-button>
              </div>
            </van-cell-group>
          </template>

          <!-- 已加入家庭：家庭信息 + 成员 -->
          <template v-else>
            <van-cell-group inset>
              <van-cell title="家庭ID">
                <template #value>
                  <span class="mono">{{ appState.familyId }}</span>
                </template>
              </van-cell>
              <van-cell v-if="inviteCodeText" title="邀请码">
                <template #value>
                  <span class="mono inviteCode">{{ inviteCodeText }}</span>
                </template>
                <template #right-icon>
                  <van-button size="mini" plain round icon="after-sort" @click="copyInviteCode">
                    复制
                  </van-button>
                </template>
              </van-cell>
              <van-cell v-else>
                <template #title>
                  <span class="muted">邀请码未加载</span>
                </template>
                <template #right-icon>
                  <van-button size="mini" plain round @click="doRefreshInviteCode">
                    刷新
                  </van-button>
                </template>
              </van-cell>
            </van-cell-group>

            <div class="memberSection">
              <div class="sectionSubHeader">
                <div class="subTitle">家庭成员</div>
                <van-button size="mini" plain round :loading="membersLoading" @click="loadFamilyMembers">
                  刷新
                </van-button>
              </div>
              <div v-if="membersLoading" class="bodyHint muted">加载中…</div>
              <div v-else-if="familyMembers.length === 0" class="bodyHint muted">
                暂无数据。若已加入家庭仍为空，请在 Supabase 为 <span class="mono">family_members</span> 开启「同家庭可读」的 SELECT 策略。
              </div>
              <van-cell-group v-else inset>
                <van-cell
                  v-for="m in familyMembers"
                  :key="m.user_id"
                  center
                  :border="true"
                >
                  <template #title>
                    <div class="memberLine">
                      <span class="memberPrimary">{{ memberDisplayLine(m) }}</span>
                      <van-tag round size="small" :type="m.role === 'owner' ? 'warning' : 'default'">
                        {{ m.role === 'owner' ? '家长' : '成员' }}
                      </van-tag>
                      <van-tag v-if="m.user_id === appState.session?.user?.id" round size="small" type="primary">
                        我
                      </van-tag>
                    </div>
                  </template>
                  <template v-if="m.email && memberDisplayLine(m) !== m.email" #label>
                    <span class="memberSecondary mono">{{ m.email }}</span>
                  </template>
                </van-cell>
              </van-cell-group>
            </div>

            <div class="bodyHint muted">添加菜品 / 下单 / 完成订单会自动同步；页面底部也可手动同步。</div>
          </template>
        </div>
      </van-collapse-item>
    </van-collapse>

    <!-- 分类管理（默认折叠） -->
    <van-collapse v-model="categoryCollapse" class="neatCollapse">
      <van-collapse-item name="cat">
        <template #title>
          <div class="neatCollapseTitle">
            <van-icon name="apps-o" />
            <span>分类管理</span>
            <span class="countBadge countBadgeMuted">{{ categories.length }}</span>
          </div>
        </template>
        <div class="catHint">左滑分类可改名或删除；默认分类不可删除。</div>
        <van-cell-group inset>
          <van-swipe-cell v-for="c in categories" :key="c.id">
            <van-cell center :border="false" class="catCell">
              <template #title>
                <div class="catLine">
                  <span class="catName">{{ c.name }}</span>
                  <van-tag v-if="c.is_default" round size="small">默认</van-tag>
                </div>
              </template>
            </van-cell>
            <template #right>
              <van-button
                square
                class="swipeBtn swipeBtnNeutral"
                text="改名"
                @click="renameCategory(c)"
              />
              <van-button
                v-if="!c.is_default"
                square
                type="danger"
                class="swipeBtn"
                text="删除"
                @click="delCategory(c)"
              />
            </template>
          </van-swipe-cell>
        </van-cell-group>
        <div class="catAddRow">
          <van-button plain round block icon="plus" @click="addCategory">
            新增分类
          </van-button>
        </div>
      </van-collapse-item>
    </van-collapse>

    <!-- 底部功能组 -->
    <van-cell-group inset class="utilityGroup">
      <van-cell
        title="历史订单"
        icon="clock-o"
        is-link
        label="查看已完成订单归档"
        @click="router.push('/me/history')"
      />
      <van-cell
        v-if="authed && inFamily"
        title="手动同步"
        icon="replay"
        is-link
        :label="appState.syncing ? '同步中…' : '把本机变更推上云端并拉取最新'"
        :clickable="!appState.syncing"
        @click="runSync('手动同步')"
      />
      <van-cell
        v-if="authed"
        title="退出登录"
        icon="close"
        is-link
        label="本地数据不会被清除"
        @click="doSignOut"
      />
    </van-cell-group>

    <!-- 通用文本弹窗（新增/改名）- iOS alert 风格 -->
    <van-popup
      v-model:show="textPromptConfig.show"
      class="iosAlert"
      :close-on-click-overlay="true"
    >
      <div class="iosAlertBody">
        <div class="iosAlertTitle">{{ textPromptConfig.title }}</div>
        <div class="iosAlertInputWrap">
          <input
            v-model="textPromptConfig.value"
            class="iosAlertInput"
            :placeholder="textPromptConfig.placeholder"
            :maxlength="textPromptConfig.maxLength"
            autofocus
            @keyup.enter="confirmTextPrompt"
          />
        </div>
      </div>
      <div class="iosAlertActions">
        <button type="button" class="iosAlertBtn" @click="textPromptConfig.show = false">
          取消
        </button>
        <button
          type="button"
          class="iosAlertBtn iosAlertBtnPrimary"
          :disabled="!textPromptConfig.value.trim()"
          @click="confirmTextPrompt"
        >
          {{ textPromptConfig.confirmText }}
        </button>
      </div>
    </van-popup>

    <DishEditorModalImpl v-model="showEditor" :dishId="editingDishId" @saved="refreshDishes" />
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wrap :deep(.van-cell-group--inset) {
  margin: 0 16px;
}

/* ---------- Profile 卡 ---------- */
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 16px;
  padding: 16px 16px;
  background: rgba(255, 255, 255, 0.82);
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
}

.heroAvatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.06);
  color: #8a8473;
  font-size: 20px;
  font-weight: 800;
  flex-shrink: 0;
}

.heroAvatar .van-icon {
  font-size: 22px;
}

.heroAvatarAuthed {
  background: linear-gradient(135deg, var(--brand-orange-soft, #ffd9b4), var(--brand-orange, #ffb45a));
  color: #7a3d00;
}

.heroInfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.heroName {
  font-size: 16px;
  font-weight: 800;
  color: var(--brand-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heroName.muted {
  color: #8a8473;
  font-weight: 700;
}

.heroSub {
  font-size: 12.5px;
  color: #8a8473;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- Section ---------- */
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  min-height: 28px;
}

.sectionHeader h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--brand-ink);
  letter-spacing: 0.2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.countBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.06);
  color: #8a8473;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.countBadgeMuted {
  background: rgba(0, 0, 0, 0.05);
}

.dishGroup :deep(.van-cell) {
  padding: 12px 14px;
}

.dishCell {
  cursor: pointer;
}

.thumb {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.04);
  margin-right: 12px;
  flex-shrink: 0;
}

.thumb.ph {
  background: linear-gradient(135deg, rgba(255, 177, 90, 0.28), rgba(46, 125, 50, 0.18));
}

.dishName {
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-ink);
}

.dishSub {
  margin-top: 2px;
  font-size: 12.5px;
  color: #8a8473;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editIcon {
  font-size: 18px;
  color: #cfc8b7;
}

.swipeBtn {
  height: 100%;
  min-width: 72px;
}

.swipeBtnNeutral {
  background: #e7e2d4;
  color: #5a523f;
}

/* ---------- 通用折叠（家庭互通 / 分类管理 共享） ---------- */
.neatCollapse {
  background: transparent;
  border: none;
}

.neatCollapse :deep(.van-collapse-item) {
  background: transparent;
}

.neatCollapse :deep(.van-collapse-item__title) {
  background: rgba(255, 255, 255, 0.82);
  margin: 0 16px;
  width: auto;
  box-sizing: border-box;
  border-radius: 14px;
  padding: 13px 16px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.neatCollapse :deep(.van-collapse-item__title::after) {
  display: none;
}

.neatCollapse :deep(.van-collapse-item__wrapper) {
  background: transparent;
}

.neatCollapse :deep(.van-collapse-item__content) {
  background: transparent;
  padding: 10px 0 2px;
}

.neatCollapseTitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 15px;
  color: var(--brand-ink);
}

.neatCollapseTitle .van-icon {
  color: var(--brand-orange-strong);
  font-size: 18px;
}

.familyBody {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}

.bodyHint {
  padding: 2px 20px 0;
  color: #8a8473;
  font-size: 12px;
  line-height: 1.55;
}

.bodyHint.muted {
  color: #a39d8c;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  word-break: break-all;
}

.inviteCode {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--brand-orange-strong);
}

.memberSection {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.sectionSubHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  min-height: 28px;
}

.subTitle {
  font-weight: 800;
  font-size: 15px;
  color: var(--brand-ink);
}

.memberLine {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.memberPrimary {
  font-weight: 700;
  color: var(--brand-ink);
}

.memberSecondary {
  opacity: 0.72;
  font-size: 12px;
}

.cellAction {
  padding: 10px 16px 14px;
}

.catHint {
  padding: 0 20px 6px;
  color: #a39d8c;
  font-size: 12px;
  line-height: 1.55;
}

.catCell {
  padding: 12px 14px;
}

.catAddRow {
  padding: 10px 16px 2px;
}

.utilityGroup :deep(.van-cell) {
  padding: 12px 14px;
}

.utilityGroup :deep(.van-cell__label) {
  font-size: 12px;
  color: #a39d8c;
}

.catLine {
  display: flex;
  align-items: center;
  gap: 8px;
}

.catName {
  font-size: 15px;
  font-weight: 700;
  color: var(--brand-ink);
}

/* ---------- iOS Alert 风格（新增分类 / 改名） ---------- */
.iosAlert {
  width: 270px !important;
  border-radius: 14px !important;
  overflow: hidden;
  background: rgba(249, 247, 243, 0.94) !important;
  backdrop-filter: saturate(1.6) blur(22px);
  -webkit-backdrop-filter: saturate(1.6) blur(22px);
  box-shadow: 0 18px 48px rgba(24, 16, 8, 0.22);
}

.iosAlertBody {
  padding: 18px 16px 16px;
  text-align: center;
}

.iosAlertTitle {
  font-size: 16px;
  font-weight: 700;
  color: var(--brand-ink);
  margin-bottom: 10px;
}

.iosAlertInputWrap {
  border: 0.5px solid rgba(60, 60, 67, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.85);
  padding: 7px 9px;
}

.iosAlertInput {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--brand-ink);
  line-height: 1.3;
}

.iosAlertActions {
  border-top: 0.5px solid rgba(60, 60, 67, 0.22);
  min-height: 44px;
  display: flex;
}

.iosAlertBtn {
  flex: 1;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--brand-orange-strong);
  font-size: 16px;
  font-weight: 400;
  cursor: pointer;
  padding: 0;
  line-height: 44px;
}

.iosAlertBtn + .iosAlertBtn {
  border-left: 0.5px solid rgba(60, 60, 67, 0.22);
}

.iosAlertBtn:first-child {
  color: #8a8473;
}

.iosAlertBtnPrimary {
  font-weight: 600;
}

.iosAlertBtn:active {
  background: rgba(60, 60, 67, 0.12);
}

.iosAlertBtn:disabled {
  color: rgba(60, 60, 67, 0.3) !important;
  background: transparent !important;
  cursor: not-allowed;
}
</style>
