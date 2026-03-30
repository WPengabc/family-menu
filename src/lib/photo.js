export async function compressImageFileToJpeg(file, { maxW = 1280, quality = 0.78 } = {}) {
  const img = await fileToImage(file)
  const { canvas } = drawToCanvas(img, maxW)
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  return blob
}

export async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',')
  const mime = (head.match(/data:(.*?);base64/)?.[1] ?? 'application/octet-stream')
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

function drawToCanvas(img, maxW) {
  const scale = Math.min(1, maxW / img.width)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, w, h }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error('图片压缩失败'))
      else resolve(b)
    }, type, quality)
  })
}

