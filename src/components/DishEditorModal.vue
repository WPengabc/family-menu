<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { addCategoryLocal, getCategories, getDish, upsertDishLocal, enqueueCloudOp } from '../lib/dataService'
import { appState, showError, showOk } from '../lib/appState'
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
const imagePath = ref(null)
const fileList = ref([])
const pickedJpegBlob = ref(null)
const uploading = ref(false)
const uploadingText = ref('')

const showCategoryPicker = ref(false)
const showAddCategory = ref(false)
const newCategoryName = ref('')

const canSave = computed(() => name.value.trim().length > 0)

const categoryLabel = computed(() => {
  const c = categories.value.find((x) => x.id === categoryId.value)
  return c?.name ?? '请选择分类'
})

const categoryColumns = computed(() =>
  categories.value.map((c) => ({ text: c.name, value: c.id })),
)

const simplifiedTip = computed(() => simplifyIngredients(ingredients.value))

function withTimeout(promise, ms, message) {
  let t
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}

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
  await syncFileListFromImagePath()
}

async function syncFileListFromImagePath() {
  if (!imagePath.value) {
    fileList.value = []
    return
  }
  const p = String(imagePath.value)
  if (p.startsWith('data:') || p.startsWith('http')) {
    fileList.value = [{ url: p, isImage: true }]
    return
  }
  if (!cloudEnabled() || !appState.session) {
    fileList.value = []
    return
  }
  try {
    const url = await getSignedDishImageUrl(p)
    fileList.value = [{ url, isImage: true }]
  } catch {
    fileList.value = []
  }
}

async function onAfterRead(item) {
  const file = item?.file
  if (!file) return
  try {
    item.status = 'uploading'
    item.message = '压缩中...'
    const blob = await compressImageFileToJpeg(file, { maxW: 1920, quality: 0.88 })
    pickedJpegBlob.value = blob
    const dataUrl = await blobToDataUrl(blob)
    imagePath.value = dataUrl
    item.url = dataUrl
    item.status = 'done'
    item.message = ''
  } catch (err) {
    item.status = 'failed'
    item.message = '处理失败'
    pickedJpegBlob.value = null
    showError(err)
  }
}

function onDeleteImage() {
  imagePath.value = null
  pickedJpegBlob.value = null
  fileList.value = []
}

function insertTemplate() {
  if (!ingredients.value.trim() || ingredients.value.trim() === '') {
    ingredients.value = '主料：；辅料：'
  } else if (!ingredients.value.includes('主料') && !ingredients.value.includes('辅料')) {
    ingredients.value = `主料：${ingredients.value}；辅料：`
  }
}

function onCategoryConfirm({ selectedOptions }) {
  const opt = selectedOptions?.[0]
  if (opt) categoryId.value = opt.value
  showCategoryPicker.value = false
}

function openAddCategory() {
  newCategoryName.value = ''
  showAddCategory.value = true
}

async function confirmAddCategory() {
  const n = newCategoryName.value.trim()
  if (!n) return
  try {
    const c = await addCategoryLocal(n)
    await enqueueCloudOp({ familyId: appState.familyId, opType: 'upsert_category', entityId: c.id, payload: { row: c } })
    await loadCategories()
    categoryId.value = c.id
    showAddCategory.value = false
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

    if (cloudEnabled() && appState.session && appState.familyId && navigator.onLine && imagePath.value) {
      const isDataUrl = String(imagePath.value).startsWith('data:image/')
      if (isDataUrl) {
        const blob = pickedJpegBlob.value ?? dataUrlToBlob(imagePath.value)
        uploadingText.value = '上传图片中...'
        const path = await withTimeout(
          uploadDishImage({ familyId: appState.familyId, dishId: baseRow.id, blob }),
          30000,
          '上传图片超时（请检查 Storage 权限/网络）',
        )
        finalRow = await upsertDishLocal({ ...baseRow, image_path: path })
        imagePath.value = path
        await syncFileListFromImagePath()
      }
    }

    const row = await upsertDishLocal({ ...finalRow })

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
    name.value = ''
    ingredients.value = '主料：；辅料：'
    imagePath.value = null
    fileList.value = []
    pickedJpegBlob.value = null
    categoryId.value = null
    await loadCategories()
    await loadDish()
    await nextTick()
  },
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
  <van-popup
    :show="modelValue"
    position="bottom"
    round
    closeable
    close-on-click-overlay
    safe-area-inset-bottom
    class="editorPopup"
    :style="{ maxHeight: '92vh' }"
    @update:show="(v) => emit('update:modelValue', v)"
  >
    <div class="popHeader">
      <div class="popTitle">{{ props.dishId ? '编辑菜品' : '添加新菜' }}</div>
    </div>

    <div class="popBody">
      <van-form @submit="save">
        <van-cell-group inset>
          <van-field
            v-model="name"
            label="菜名"
            placeholder="例如：番茄炒蛋"
            maxlength="40"
            required
            :rules="[{ required: true, message: '请输入菜名' }]"
          />

          <van-field
            label="菜品图片"
            :border="false"
          >
            <template #input>
              <van-uploader
                v-model="fileList"
                :max-count="1"
                accept="image/*"
                :preview-size="110"
                :after-read="onAfterRead"
                @delete="onDeleteImage"
              />
            </template>
          </van-field>

          <van-field
            v-model="ingredients"
            label="食材"
            type="textarea"
            rows="3"
            autosize
            placeholder="主料：...；辅料：..."
            maxlength="300"
            show-word-limit
          >
            <template #button>
              <van-button size="mini" plain round @click="insertTemplate">插入模板</van-button>
            </template>
          </van-field>

          <van-field
            :model-value="simplifiedTip"
            label="简化"
            readonly
            input-align="left"
            placeholder="（保存时用于订单快照）"
          />

          <van-field
            :model-value="categoryLabel"
            label="分类"
            is-link
            readonly
            placeholder="选择分类"
            @click="showCategoryPicker = true"
          >
            <template #button>
              <van-button size="mini" plain round icon="plus" @click.stop="openAddCategory">
                新建
              </van-button>
            </template>
          </van-field>
        </van-cell-group>

        <div class="submitRow">
          <van-button
            type="warning"
            block
            round
            :loading="uploading"
            :loading-text="uploadingText || '处理中...'"
            :disabled="!canSave"
            native-type="submit"
          >
            {{ props.dishId ? '保存修改' : '保存新菜' }}
          </van-button>
        </div>
      </van-form>
    </div>

    <!-- 分类选择器 -->
    <van-popup
      v-model:show="showCategoryPicker"
      position="bottom"
      round
      safe-area-inset-bottom
      teleport="body"
    >
      <van-picker
        :columns="categoryColumns"
        :model-value="categoryId ? [categoryId] : []"
        @confirm="onCategoryConfirm"
        @cancel="showCategoryPicker = false"
      />
    </van-popup>

    <!-- 新建分类 -->
    <van-popup
      v-model:show="showAddCategory"
      round
      safe-area-inset-bottom
      teleport="body"
      :style="{ width: '86%', maxWidth: '360px', padding: '18px 18px 14px' }"
    >
      <div class="addCatTitle">新建分类</div>
      <van-field
        v-model="newCategoryName"
        placeholder="例如：川菜 / 早餐"
        maxlength="12"
        autofocus
        @keyup.enter="confirmAddCategory"
      />
      <div class="addCatActions">
        <van-button plain round block size="normal" @click="showAddCategory = false">取消</van-button>
        <van-button
          type="warning"
          round
          block
          size="normal"
          :disabled="!newCategoryName.trim()"
          @click="confirmAddCategory"
        >
          创建
        </van-button>
      </div>
    </van-popup>
  </van-popup>
</template>

<style scoped>
.editorPopup {
  --van-cell-group-inset-padding: 0 12px;
}

.popHeader {
  padding: 18px 18px 6px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
}

.popTitle {
  font-size: 18px;
  font-weight: 900;
  color: var(--brand-ink);
}

.popBody {
  padding: 12px 0 16px;
  overflow-y: auto;
  max-height: calc(92vh - 60px);
}

.submitRow {
  padding: 14px 16px 4px;
}

.addCatTitle {
  font-size: 17px;
  font-weight: 900;
  color: var(--brand-ink);
  margin-bottom: 10px;
}

.addCatActions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

:deep(.van-cell-group--inset) {
  margin: 0 12px 10px;
}

:deep(.van-field__label) {
  width: 64px;
  font-weight: 700;
  color: var(--brand-ink);
}
</style>
