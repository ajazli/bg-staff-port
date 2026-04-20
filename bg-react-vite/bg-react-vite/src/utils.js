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
  return localDateToStr(new Date())
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
