<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { addCategoryLocal, enqueueCloudOp, getCategories, getDish, upsertDishLocal } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'

const route = useRoute()
const router = useRouter()

const dishId = computed(() => route.params.id ?? null)
const isEdit = computed(() => !!dishId.value)

const name = ref('')
const ingredients = ref('主料：；辅料：')
const categoryId = ref(null)
const categories = ref([])
const imageDataUrl = ref(null)

const canSave = computed(() => name.value.trim().length > 0)

async function load() {
  categories.value = await getCategories()
  if (!categoryId.value) categoryId.value = categories.value[0]?.id ?? null

  if (isEdit.value) {
    const d = await getDish(dishId.value)
    if (!d) return
    name.value = d.name ?? ''
    ingredients.value = d.ingredients_text ?? '主料：；辅料：'
    categoryId.value = d.category_id ?? categoryId.value
    imageDataUrl.value = d.image_path?.startsWith('data:') ? d.image_path : null
  }
}

function insertTemplate() {
  if (!ingredients.value.trim()) ingredients.value = '主料：；辅料：'
}

function pickImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    imageDataUrl.value = reader.result
  }
  reader.readAsDataURL(file)
}

async function quickAddCategory() {
  const n = prompt('输入新分类名称：')
  if (!n?.trim()) return
  try {
    const c = await addCategoryLocal(n)
    categories.value = await getCategories()
    categoryId.value = c.id
    showOk('已新增分类（本机）')
  } catch (e) {
    showError(e)
  }
}

async function save() {
  if (!canSave.value) return
  try {
    const row = await upsertDishLocal({
      id: isEdit.value ? dishId.value : null,
      name: name.value,
      category_id: categoryId.value,
      ingredients_text: ingredients.value,
      image_path: imageDataUrl.value ?? null,
    })
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_dish', entityId: row.id, payload: { row } })
    showOk(isEdit.value ? '已保存修改（本机）' : '已添加到我的菜品库（本机）')
    router.replace(`/dish/${row.id}`)
  } catch (e) {
    showError(e)
  }
}

onMounted(load)
</script>

<template>
  <section class="card">
    <h2>{{ isEdit ? '编辑菜品' : '添加新菜' }}</h2>

    <div class="field">
      <label>菜名（必填）</label>
      <input v-model="name" class="input" placeholder="例如：番茄炒蛋" />
    </div>

    <div class="field">
      <label>菜品图片（相册/拍照）</label>
      <input class="input" type="file" accept="image/*" capture="environment" @change="pickImage" />
      <div v-if="imageDataUrl" class="imgWrap">
        <img :src="imageDataUrl" alt="preview" />
      </div>
      <div class="hint">提示：演示版图片先保存在本机；如需家庭互通，后续接 Supabase Storage。</div>
    </div>

    <div class="field">
      <label>所需食材（主料/辅料）</label>
      <textarea v-model="ingredients" class="textarea" rows="4" placeholder="主料：...；辅料：..." />
      <button class="btn sm" @click="insertTemplate">插入模板</button>
    </div>

    <div class="field">
      <label>归属分类</label>
      <select v-model="categoryId" class="input">
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <button class="btn sm" @click="quickAddCategory">+ 新建分类</button>
    </div>

    <div class="actions">
      <button class="btn primary" :disabled="!canSave" @click="save">保存</button>
      <button class="btn" @click="$router.back()">返回</button>
      <button class="btn" @click="$router.push('/')">回首页</button>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 14px;
}
h2 { margin: 0 0 12px; font-size: 18px; }
.field { margin-bottom: 12px; }
label { display:block; font-weight: 800; margin-bottom: 6px; }
.input, .textarea {
  width: 100%;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.14);
  background: rgba(255,255,255,0.9);
  font-size: 16px;
  outline: none;
}
.textarea { resize: vertical; }
.imgWrap { margin-top: 10px; }
.imgWrap img { width: 140px; height: 140px; object-fit: cover; border-radius: 14px; border:1px solid rgba(0,0,0,0.08); }
.hint { margin-top: 8px; opacity: .75; font-size: 14px; line-height: 1.5; }
.actions { display:flex; gap:10px; flex-wrap:wrap; margin-top: 10px; }
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
.btn.sm { padding: 10px 12px; font-size: 14px; margin-top: 8px; }
.btn:disabled { opacity: .55; }
</style>

