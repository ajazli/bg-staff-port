export function parseLocalDate(dateStr) {
  return dateStr ? new Date(`${dateStr}T00:00:00`) : null
}

export function localDateToStr(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayStr() {
  // Always return the current date in SGT (GMT+8), regardless of device timezone
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function timeStrToMinutes(str) {
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return null
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

export function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${day} ${mn[Number(m) - 1]} ${y}`
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Resize + compress an image File to a JPEG data URL.
// maxWidth: cap the longest side; quality: 0–1 JPEG quality.
// Falls back to raw readAsDataURL if canvas fails (e.g. PDF passed by mistake).
export function compressImage(file, maxWidth = 1200, quality = 0.80) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.readAsDataURL(file)
    }
    img.src = objectUrl
  })
}
