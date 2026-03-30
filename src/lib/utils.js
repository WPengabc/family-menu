export function nowIso() {
  return new Date().toISOString()
}

export function formatTime(ts) {
  if (!ts) return '—'
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
  return d.toLocaleString()
}

export function genId(prefix) {
  return `${prefix}${Date.now()}`
}

export function simplifyIngredients(text) {
  if (!text) return '食材略'
  const m = String(text).match(/主料[:：]\s*([^；;\n]+)/)
  if (m?.[1]) return (`主料：${m[1]}`).slice(0, 48)
  return String(text).replace(/\s+/g, ' ').slice(0, 48)
}

