import { genId, nowIso } from './utils'
import { listAll, upsertMany } from './localDb'

function svgData(bg, fg, label) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="96" fill="${bg}"/>
  <circle cx="256" cy="230" r="118" fill="rgba(255,255,255,0.22)"/>
  <text x="256" y="270" text-anchor="middle" font-size="64" font-weight="800" fill="${fg}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"> ${label} </text>
  <text x="256" y="360" text-anchor="middle" font-size="28" font-weight="700" fill="rgba(0,0,0,0.38)" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">家庭点菜</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function seedDemoDataIfEmpty() {
  const dishes = await listAll('dishes')
  const categories = await listAll('categories')

  if (categories.length === 0) {
    const now = nowIso()
    const defaultCats = [
      { id: 'cat_home', name: '家常菜', is_default: true, sort: 1, updated_at: now },
      { id: 'cat_soup', name: '汤品', is_default: true, sort: 2, updated_at: now },
      { id: 'cat_cold', name: '凉菜', is_default: true, sort: 3, updated_at: now },
      { id: 'cat_main', name: '主食', is_default: true, sort: 4, updated_at: now },
      { id: 'cat_dessert', name: '甜品', is_default: true, sort: 5, updated_at: now },
    ]
    await upsertMany('categories', defaultCats)
  }

  if (dishes.length === 0) {
    const now = nowIso()
    const demo = [
      {
        id: genId('D'),
        name: '番茄炒蛋',
        category_id: 'cat_home',
        ingredients_text: '主料：番茄2个、鸡蛋3个；辅料：盐1勺、糖半勺',
        image_path: svgData('#FFB15A', '#2B2B2B', '番茄'),
        updated_at: now,
        deleted_at: null,
      },
      {
        id: genId('D'),
        name: '紫菜蛋花汤',
        category_id: 'cat_soup',
        ingredients_text: '主料：紫菜1把、鸡蛋1个；辅料：盐、香油',
        image_path: svgData('#BFE8B8', '#1F2E1F', '紫菜'),
        updated_at: now,
        deleted_at: null,
      },
      {
        id: genId('D'),
        name: '拍黄瓜',
        category_id: 'cat_cold',
        ingredients_text: '主料：黄瓜2根；辅料：蒜末、醋、盐、香油',
        image_path: svgData('#C8F2E3', '#1E2B2B', '黄瓜'),
        updated_at: now,
        deleted_at: null,
      },
    ]
    await upsertMany('dishes', demo)
  }

  // 如果之前已经初始化过，但缺少内置演示图片，则补齐（方便你直接看演示效果）
  const dishImgMap = {
    '番茄炒蛋': svgData('#FFB15A', '#2B2B2B', '番茄'),
    '紫菜蛋花汤': svgData('#BFE8B8', '#1F2E1F', '紫菜'),
    '拍黄瓜': svgData('#C8F2E3', '#1E2B2B', '黄瓜'),
  }
  const needsUpdate = dishes.some((d) => !d.image_path && dishImgMap[d.name])
  if (needsUpdate) {
    const updated = dishes.map((d) => {
      if (!d.image_path && dishImgMap[d.name]) {
        return { ...d, image_path: dishImgMap[d.name], updated_at: nowIso() }
      }
      return d
    })
    await upsertMany('dishes', updated)
  }
}

