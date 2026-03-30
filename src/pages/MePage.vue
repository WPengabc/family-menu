<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { appState, refreshAuth, refreshFamily, runSync, showError, showOk } from '../lib/appState'
import { createFamily, getFamilyInfo, joinFamilyByInviteCode, refreshFamilyInfo, signInWithOtp, signOut } from '../lib/familyApi'
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
const email = ref('')
const familyName = ref('我的家庭')
const inviteCode = ref('')
const categories = ref([])
const dishes = ref([])
const familyInfo = ref(null)

const showEditor = ref(false)
const editingDishId = ref(null)

const authed = computed(() => !!appState.session)
const inFamily = computed(() => !!appState.familyId)
const dishCount = computed(() => dishes.value.length)
const inviteCodeText = computed(() => familyInfo.value?.invite_code ?? '')

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
    showOk('已发送登录链接到邮箱，请在手机邮箱里打开完成登录')
  } catch (e) {
    showError(e)
  }
}

async function doSignOut() {
  try {
    await signOut()
    await refreshAuth()
    await refreshFamily()
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

async function delDish(id) {
  if (!confirm('确认删除该菜品？')) return
  try {
    const row = await deleteDishLocal(id)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_dish', entityId: id, payload: { row } })
    showOk('已删除（本机）')
    await refreshDishes()
  } catch (e) {
    showError(e)
  }
}

async function addCategory() {
  const n = prompt('输入新分类名称：')
  if (!n?.trim()) return
  try {
    const row = await addCategoryLocal(n)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_category', entityId: row.id, payload: { row } })
    await refreshCategories()
    showOk('已新增分类（本机）')
  } catch (e) {
    showError(e)
  }
}

async function renameCategory(c) {
  const n = prompt('输入新名称：', c.name)
  if (!n?.trim()) return
  try {
    const row = await renameCategoryLocal(c.id, n)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_category', entityId: row.id, payload: { row } })
    await refreshCategories()
    showOk('已重命名（本机）')
  } catch (e) {
    showError(e)
  }
}

async function delCategory(c) {
  if (c.is_default) return
  if (!confirm(`确认删除分类“${c.name}”？该分类下菜品会迁移到“家常菜”。`)) return
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
  await refreshCategories()
  await refreshDishes()
  familyInfo.value = await getFamilyInfo()
  // 兼容：以前创建家庭时未保存 familyInfo，这里补拉一次邀请码
  if (authed.value && inFamily.value && !familyInfo.value) {
    try {
      familyInfo.value = await refreshFamilyInfo()
    } catch (e) {
      showError(e)
    }
  }
})
</script>

<template>
  <section class="card">
    <div class="row">
      <h2>我的菜品库</h2>
      <button class="btn primary" @click="openAdd">+ 添加新菜</button>
    </div>
    <div class="hint">共 {{ dishCount }} 道；离线也能操作，联网后可互通。</div>

    <div v-if="dishes.length === 0" class="empty">暂无菜品，点击“添加新菜”开始。</div>

    <div v-else class="dishList">
      <div v-for="d in dishes" :key="d.id" class="dishItem">
        <DishThumb :imagePath="d.image_path" className="thumb" />
        <div class="info">
          <div class="name">{{ d.name }}</div>
          <div class="sub">{{ (d.ingredients_text || '').slice(0, 28) }}<span v-if="(d.ingredients_text||'').length>28">…</span></div>
        </div>
        <div class="right">
          <button class="btn sm" @click="openEdit(d.id)">编辑</button>
          <button class="btn sm danger" @click="delDish(d.id)">删除</button>
        </div>
      </div>
    </div>
  </section>

  <details class="card">
    <summary class="sumTitle">家庭互通（登录后共享）</summary>
    <div class="hint">
      当前状态：
      <b>{{ authed ? '已登录' : '未登录' }}</b>
      <span v-if="authed">（{{ appState.session?.user?.email }}）</span>
      <span class="sep">·</span>
      <b>{{ inFamily ? '已加入家庭' : '未加入家庭' }}</b>
    </div>

    <div v-if="!authed" class="panel" style="margin-top:10px;">
      <div class="hint">输入邮箱后会收到登录链接；在手机邮箱里点开即可登录。</div>
      <div class="row">
        <input v-model="email" class="input" placeholder="邮箱，例如 xxx@qq.com" inputmode="email" />
        <button class="btn primary" @click="doSignIn">发送登录链接</button>
      </div>
    </div>

    <div v-else class="panel" style="margin-top:10px;">
      <div class="row">
        <div class="hint">登录用户：<span class="mono">{{ appState.session?.user?.email }}</span></div>
        <button class="btn sm" @click="doSignOut">退出</button>
      </div>

      <div v-if="!inFamily" class="grid2" style="margin-top:10px;">
        <div class="panel">
          <h3>创建家庭</h3>
          <div class="hint">第 1 位成员创建后，会生成邀请码分享给家人。</div>
          <input v-model="familyName" class="input" placeholder="家庭名称（可选）" />
          <button class="btn primary" @click="doCreateFamily">创建并生成邀请码</button>
        </div>
        <div class="panel">
          <h3>加入家庭</h3>
          <div class="hint">家人发你 6 位邀请码，输入即可加入同一家庭。</div>
          <input v-model="inviteCode" class="input" placeholder="6位邀请码" inputmode="numeric" />
          <button class="btn primary" @click="doJoinFamily">加入</button>
        </div>
      </div>

      <div v-else class="panel" style="margin-top:10px;">
        <div class="kv">
          <div class="k">家庭ID</div>
          <div class="v mono">{{ appState.familyId }}</div>
        </div>
        <div class="kv" v-if="inviteCodeText">
          <div class="k">邀请码</div>
          <div class="v mono">
            {{ inviteCodeText }}
            <button class="btn sm" style="margin-left:10px;" @click="navigator.clipboard?.writeText(inviteCodeText); showOk('已复制邀请码')">
              复制
            </button>
          </div>
        </div>
        <div v-else class="hint">
          邀请码未加载
          <button class="btn sm" style="margin-left:10px;" @click="refreshFamilyInfo().then((x)=>{familyInfo=x; if(x?.invite_code) showOk('已加载邀请码')})">
            刷新邀请码
          </button>
        </div>
        <button class="btn primary" :disabled="appState.syncing" @click="runSync('手动同步')">手动同步</button>
        <div class="hint">现在开始：添加菜品/生成订单/完成订单会自动同步到数据库。</div>
      </div>
    </div>
  </details>

  <section class="card">
    <h2>历史订单</h2>
    <button class="btn" @click="router.push('/me/history')">进入历史订单</button>
  </section>

  <section class="card">
    <div class="row">
      <h2>分类管理（彩蛋功能配套）</h2>
      <button class="btn sm" @click="addCategory">+ 新增分类</button>
    </div>
    <div class="hint">默认分类不可删除；自定义分类支持新增/重命名/删除。</div>

    <div class="catList">
      <div v-for="c in categories" :key="c.id" class="catItem">
        <div class="left">
          <div class="catName">
            {{ c.name }}
            <span v-if="c.is_default" class="tag">默认</span>
          </div>
        </div>
        <div class="right">
          <button class="btn sm" @click="renameCategory(c)">改名</button>
          <button class="btn sm danger" :disabled="c.is_default" @click="delCategory(c)">删除</button>
        </div>
      </div>
    </div>
  </section>

  <DishEditorModalImpl v-model="showEditor" :dishId="editingDishId" @saved="refreshDishes" />
</template>

<style scoped>
.card {
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
}
h2 { margin: 0 0 8px; font-size: 18px; }
h3 { margin: 0 0 8px; font-size: 16px; }
.hint { margin-top: 6px; opacity: .78; line-height: 1.55; }
.row { display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
.grid2 { display:grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 720px) { .grid2 { grid-template-columns: 1fr 1fr; } }
.panel {
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed rgba(0,0,0,0.14);
  background: rgba(255,255,255,0.55);
}
.input {
  width: 100%;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.14);
  background: rgba(255,255,255,0.9);
  font-size: 16px;
  outline: none;
}
.btn {
  padding: 12px 14px;
  border-radius: 12px;
  border: none;
  background: rgba(0,0,0,0.06);
  color: #2b2b2b;
  font-size: 16px;
  font-weight: 800;
}
.btn.primary { background:#ffb15a; }
.btn.sm { padding: 10px 12px; font-size: 14px; }
.btn.danger { background: rgba(211,47,47,0.14); }
.btn:disabled { opacity: .55; }
.kv { display: grid; grid-template-columns: 90px 1fr; gap: 8px; margin-bottom: 10px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; }

.empty { padding: 16px 0; opacity: .8; }
.dishList { margin-top: 10px; display:flex; flex-direction:column; gap:10px; }
.dishItem {
  display:flex; gap:12px; align-items:center; justify-content:space-between;
  padding: 10px; border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.55);
}
.thumb {
  width: 56px; height: 56px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(0,0,0,0.04);
}
.thumb.ph {
  background: linear-gradient(135deg, rgba(255,177,90,0.28), rgba(46,125,50,0.18));
}
.info { flex: 1; min-width: 0; }
.name { font-size: 18px; font-weight: 900; }
.sub { margin-top: 4px; opacity: .75; font-size: 14px; line-height: 1.4; }
.right { display:flex; gap:8px; align-items:center; }

.catList { margin-top: 10px; display:flex; flex-direction:column; gap:10px; }
.catItem {
  display:flex; justify-content:space-between; gap:10px; align-items:center;
  padding: 10px; border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.55);
}
.catName { font-weight: 900; font-size: 16px; }
.tag {
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0,0,0,0.06);
  opacity: .85;
}
.sumTitle { cursor: pointer; font-weight: 900; }
.sep { margin: 0 6px; opacity: .6; }
</style>

