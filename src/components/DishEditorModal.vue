<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addCategoryLocal, getCategories, getDish, upsertDishLocal } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
import { enqueueCloudOp } from '../lib/dataService'
import { simplifyIngredients } from '../lib/utils'
import { blobToDataUrl, compressImageFileToJpeg, dataUrlToBlob } from '../lib/photo'
import { cloudEnabled, getSignedDishImageUrl, uploadDishImage } from '../lib/cloudRepo'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  dishId: { type: String, default: null },
})

const emit = defineEmits(['update:modelValue', 'saved'])

const name = ref('')
const ingredients = ref('主料：；辅料：')
const categories = ref([])
const categoryId = ref(null)
// 存储：本地 dataUrl 或云端 storage path
const imagePath = ref(null)
// 展示：用于 <img src> 的可访问 URL（dataUrl 或 signedUrl）
const imagePreviewSrc = ref(null)
const albumInput = ref(null)
const cameraInput = ref(null)
const pickedJpegBlob = ref(null)
const uploading = ref(false)
const uploadingText = ref('')
const modalRef = ref(null)

function withTimeout(promise, ms, message) {
  let t
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}

const canSave = computed(() => name.value.trim().length > 0)

function close() {
  emit('update:modelValue', false)
}

function onEsc(e) {
  if (e.key === 'Escape' && props.modelValue) close()
}

async function loadCategories() {
  categories.value = await getCategories()
  if (!categoryId.value) categoryId.value = categories.value[0]?.id ?? null
}

async function loadDish() {
  if (!props.dishId) return
  const d = await getDish(props.dishId)
  if (!d) return
  name.value = d.name ?? ''
  ingredients.value = d.ingredients_text ?? '主料：；辅料：'
  categoryId.value = d.category_id ?? categoryId.value
  imagePath.value = d.image_path ?? null
  await refreshPreview()
}

async function refreshPreview() {
  if (!imagePath.value) {
    imagePreviewSrc.value = null
    return
  }
  const p = String(imagePath.value)
  if (p.startsWith('data:') || p.startsWith('http')) {
    imagePreviewSrc.value = p
    return
  }
  // storage path -> signed url（需要登录）
  if (!cloudEnabled() || !appState.session) {
    imagePreviewSrc.value = null
    return
  }
  try {
    imagePreviewSrc.value = await getSignedDishImageUrl(p)
  } catch {
    imagePreviewSrc.value = null
  }
}

function insertTemplate() {
  if (!ingredients.value.trim()) ingredients.value = '主料：；辅料：'
}

function onPicked(e) {
  const file = e.target.files?.[0]
  if (!file) return
  ;(async () => {
    try {
      // 压缩成 jpeg（更清晰的参数），既减小本地存储也减小后续上云
      // 视觉清晰优先：长边 1920 + 更高质量
      const blob = await compressImageFileToJpeg(file, { maxW: 1920, quality: 0.88 })
      pickedJpegBlob.value = blob
      imagePath.value = await blobToDataUrl(blob)
      imagePreviewSrc.value = imagePath.value
    } catch (err) {
      pickedJpegBlob.value = null
      showError(err)
    }
  })()
}

function pickAlbum() {
  albumInput.value?.click()
}

function pickCamera() {
  cameraInput.value?.click()
}

async function quickAddCategory() {
  const n = prompt('输入新分类名称：')
  if (!n?.trim()) return
  try {
    const c = await addCategoryLocal(n)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_category', entityId: c.id, payload: { row: c } })
    await loadCategories()
    categoryId.value = c.id
    showOk('已新增分类（本机）')
  } catch (e) {
    showError(e)
  }
}

async function save() {
  if (!canSave.value) return
  try {
    uploading.value = true
    uploadingText.value = '保存中...'
    const id = props.dishId ?? null
    const baseRow = await upsertDishLocal({
      id,
      name: name.value,
      category_id: categoryId.value,
      ingredients_text: ingredients.value,
      image_path: imagePath.value ?? null,
    })

    let finalRow = baseRow

    // 已登录 + 已加入家庭 + 在线：把图片上传到 Storage，并把 image_path 改成云端路径
    if (cloudEnabled() && appState.session && appState.familyId && navigator.onLine && imagePath.value) {
      // 只有 dataUrl 才需要上传；演示 svg dataUrl 也能上传，但不必要，先跳过
      const isDataUrl = String(imagePath.value).startsWith('data:image/')
      if (isDataUrl) {
        const blob = pickedJpegBlob.value ?? dataUrlToBlob(imagePath.value)
        uploadingText.value = '上传图片中...'
        const path = await withTimeout(
          uploadDishImage({ familyId: appState.familyId, dishId: baseRow.id, blob }),
          30000,
          '上传图片超时（请检查 Storage 权限/网络）'
        )
        finalRow = await upsertDishLocal({ ...baseRow, image_path: path })
        imagePath.value = path
        await refreshPreview()
      }
    }

    const row = await upsertDishLocal({
      ...finalRow,
    })

    // 可选：若已加入家庭并开启 Supabase，则把变更入队同步
    uploadingText.value = '同步中...'
    await enqueueCloudOp({
      familyId: appState.familyId,
      opType: 'upsert_dish',
      entityId: row.id,
      payload: { row },
    })

    showOk(props.dishId ? '已保存修改（本机）' : '已添加新菜（本机）')
    emit('saved', row.id)
    close()
  } catch (e) {
    showError(e)
  } finally {
    uploading.value = false
    uploadingText.value = ''
  }
}

watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    // 打开弹窗时重置/加载，保证演示体验稳定
    name.value = ''
    ingredients.value = '主料：；辅料：'
    imagePath.value = null
    imagePreviewSrc.value = null
    categoryId.value = null
    await loadCategories()
    await loadDish()
    await nextTick()
    modalRef.value?.focus()
  }
)

onMounted(async () => {
  window.addEventListener('keydown', onEsc)
  if (props.modelValue) {
    await loadCategories()
    await loadDish()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEsc)
})
 </script>

<template>
  <div v-if="modelValue" class="mask" @click.self="close">
    <div ref="modalRef" class="modal" role="dialog" aria-modal="true" aria-label="菜品编辑弹窗" tabindex="-1">
      <div class="modalTop">
        <div class="title">{{ props.dishId ? '编辑菜品' : '添加新菜' }}</div>
        <button class="btn sm" @click="close">关闭</button>
      </div>

      <div class="field">
        <label>菜名（必填）</label>
        <input v-model="name" class="input" placeholder="例如：番茄炒蛋" />
      </div>

      <div class="field">
        <label>菜品图片（相册/拍照）</label>
        <div class="imgActions">
          <button class="btn sm" type="button" @click="pickAlbum">从相册选择</button>
          <button class="btn sm" type="button" @click="pickCamera">拍照上传</button>
        </div>

        <input ref="albumInput" class="hiddenFile" type="file" accept="image/*" @change="onPicked" />
        <input
          ref="cameraInput"
          class="hiddenFile"
          type="file"
          accept="image/*"
          capture="environment"
          @change="onPicked"
        />

        <div v-if="imagePreviewSrc" class="imgWrap">
          <img :src="imagePreviewSrc" alt="preview" />
        </div>
        <div v-else class="imgWrap ph">（可选，不填也能演示）</div>
      </div>

      <div class="field">
        <label>所需食材（主料/辅料，多行）</label>
        <textarea v-model="ingredients" class="textarea" rows="4" placeholder="主料：...；辅料：..." />
        <button class="btn sm" @click="insertTemplate">插入模板</button>
        <div class="mini">{{ simplifyIngredients(ingredients) }}</div>
      </div>

      <div class="field">
        <label>归属分类</label>
        <select v-model="categoryId" class="input">
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button class="btn sm" @click="quickAddCategory">+ 新建分类</button>
      </div>

      <div class="actions">
        <button class="btn primary" :disabled="!canSave || uploading" @click="save">
          {{ uploading ? (uploadingText || '处理中...') : (props.dishId ? '保存修改' : '保存新菜') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 14px;
}
.modal {
  width: 100%;
  max-width: 640px;
  background: rgba(255,255,255,0.98);
  border-radius: 18px;
  border: 1px solid rgba(0,0,0,0.08);
  padding: 14px;
  overflow: auto;
  max-height: 82vh;
}
.modalTop { display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
.title { font-size: 18px; font-weight: 900; }
.field { margin-bottom: 12px; }
label { display:block; font-weight: 900; margin-bottom: 6px; }
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
.imgWrap {
  margin-top: 10px;
  width: 100%;
  display:flex;
  align-items:center;
  justify-content:center;
}
.imgWrap img {
  width: 140px;
  height: 140px;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.08);
  object-fit: cover;
}
.imgWrap.ph {
  height: 140px;
  background: rgba(0,0,0,0.04);
  border-radius: 14px;
  border: 1px dashed rgba(0,0,0,0.14);
  opacity: .8;
  font-weight: 800;
  padding: 10px;
}
.imgActions { display:flex; gap:10px; flex-wrap:wrap; margin-bottom: 8px; }
.mini { margin-top: 8px; opacity: .7; font-size: 13px; }
.actions { display:flex; justify-content:flex-end; }
.hiddenFile {
  position: absolute;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.btn {
  padding: 12px 14px;
  border-radius: 12px;
  border: none;
  background: rgba(0,0,0,0.06);
  color: #2b2b2b;
  font-size: 16px;
  font-weight: 900;
}
.btn.primary { background:#ffb15a; }
.btn.sm { padding: 10px 12px; font-size: 14px; }
.btn:disabled { opacity: .55; }
</style>
