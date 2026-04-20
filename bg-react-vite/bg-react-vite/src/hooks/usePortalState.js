import { useEffect, useMemo, useState } from 'react'
import { initialData, LEAVE_TYPES, SG_PUBLIC_HOLIDAYS, WORKDAY_OPTIONS } from '../data/mockData'
import { genId, localDateToStr, parseLocalDate, timeStrToMinutes } from '../utils'

const STORAGE_KEY = 'bg-staff-react-vite-v2'
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

const clone = (v) => JSON.parse(JSON.stringify(v))

function seedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : clone(initialData)
  } catch {
    return clone(initialData)
  }
}

function ensureUserBalance(uid, db) {
  if (!db.balances[uid]) db.balances[uid] = {}
  LEAVE_TYPES.forEach((t) => {
    if (!db.balances[uid][t.id]) db.balances[uid][t.id] = { total: t.defaultDays, used: 0 }
  })
}

function getUserWorkDays(uid, db) {
  const days = db.users[uid]?.workDays
  return Array.isArray(days) && days.length ? days.map(Number) : [...DEFAULT_WORK_DAYS]
}

function isScheduledWorkDay(uid, dateStr, db) {
  const dt = parseLocalDate(dateStr)
  if (!dt) return false
  return getUserWorkDays(uid, db).includes(dt.getDay())
}

function applyAttendanceTiming(uid, record, db) {
  const user = db.users[uid]
  const workDay = isScheduledWorkDay(uid, record.date, db)
  record.expectedStart = workDay ? user?.expectedStart || '' : ''
  record.expectedEnd   = workDay ? user?.expectedEnd   || '' : ''

  const inMins      = timeStrToMinutes(record.in)
  const expStartMin = timeStrToMinutes(record.expectedStart)
  record.lateMinutes = inMins !== null && expStartMin !== null ? Math.max(0, inMins - expStartMin) : 0
  record.isLate      = record.lateMinutes > 0

  const outMins    = timeStrToMinutes(record.out)
  const expEndMin  = timeStrToMinutes(record.expectedEnd)
  record.earlyLeaveMinutes = outMins !== null && expEndMin !== null ? Math.max(0, expEndMin - outMins) : 0
  record.leftEarly         = record.earlyLeaveMinutes > 0
  record.overtimeMinutes   = outMins !== null && expEndMin !== null ? Math.max(0, outMins - expEndMin) : 0
  record.didOvertime        = record.overtimeMinutes > 0
}

function creditPhOffInLieuIfNeeded(uid, record, db) {
  ensureUserBalance(uid, db)
  const ph = SG_PUBLIC_HOLIDAYS[record.date]
  if (!ph) { record.phName = ''; return false }
  record.phName = ph.name
  if (!isScheduledWorkDay(uid, record.date, db)) { record.phCreditAdded = false; record.phCreditSkipped = true; return false }
  if (record.phCreditAdded) return false
  record.phCreditAdded = true
  record.phCreditSkipped = false
  db.balances[uid]['PH Off-in-Lieu'].total += 1
  return true
}

export function usePortalState() {
  const [db, setDb]                   = useState(seedState)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [clockSession, setClockSession]   = useState({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)) }, [db])

  // Re-compute attendance timing on first mount
  useEffect(() => {
    setDb((prev) => {
      const next = clone(prev)
      if (!next.activeSessions)  next.activeSessions  = {}
      if (!next.calendarEvents)  next.calendarEvents  = []
      if (!next.shiftTemplates)  next.shiftTemplates  = clone(initialData.shiftTemplates)
      if (!next.schedules)       next.schedules       = {}
      Object.entries(next.attendance).forEach(([uid, records]) => {
        records.forEach((rec) => {
          applyAttendanceTiming(uid, rec, next)
          creditPhOffInLieuIfNeeded(uid, rec, next)
        })
      })
      // Migrate old leave type names
      Object.entries(next.leaves).forEach(([, records]) => {
        records.forEach((rec) => {
          if (rec.type === 'PH off in lieu') rec.type = 'PH Off-in-Lieu'
          if (rec.type === 'Medical leave')  rec.type = 'Sick Leave'
          if (rec.type === 'Annual leave')   rec.type = 'Annual Leave'
          if (rec.type === 'Emergency leave') rec.type = 'Compassionate Leave'
        })
      })
      return next
    })
  }, [])

  const currentUser = currentUserId ? db.users[currentUserId] : null

  // ─── helpers ───────────────────────────────────────────────────────────────
  const helpers = useMemo(() => ({
    fmtDate: (d) => {
      if (!d) return '—'
      const [y, m, day] = d.split('-')
      const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return `${day} ${mn[Number(m) - 1]} ${y}`
    },
    cap: (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : ''),
    getBranch: (id) => db.branches.find((b) => b.id === id) || null,
    getUserBranches: (uid) => (db.users[uid]?.branchIds || []).map((id) => db.branches.find((b) => b.id === id)).filter(Boolean),
    getBalanceRemaining: (uid, col) => {
      const bal = db.balances[uid]?.[col] || { total: 0, used: 0 }
      return bal.total - bal.used
    },
    getTimingBadges: (record) => {
      const badges = []
      if (record.expectedStart) badges.push(record.isLate ? `Late (${record.lateMinutes}m)` : 'On time')
      if (record.expectedEnd) {
        if (record.leftEarly) badges.push(`Left early (${record.earlyLeaveMinutes}m)`)
        else if (record.didOvertime) badges.push(`Overtime (${record.overtimeMinutes}m)`)
        else badges.push('On end time')
      }
      return badges
    },
    getUserWorkDays: (uid) => getUserWorkDays(uid, db),
    // Returns direct reports of uid
    getDirectReports: (uid) =>
      Object.entries(db.users)
        .filter(([id, u]) => u.reportsTo === uid && id !== uid)
        .map(([id, u]) => ({ id, ...u })),
    // Returns all subordinates (recursive) of uid
    getAllSubordinates: (uid) => {
      const result = []
      const queue = [uid]
      while (queue.length) {
        const cur = queue.shift()
        Object.entries(db.users).forEach(([id, u]) => {
          if (u.reportsTo === cur && id !== uid) {
            result.push(id)
            queue.push(id)
          }
        })
      }
      return result
    },
    getLeaveType: (id) => LEAVE_TYPES.find((t) => t.id === id) || null,
    getShiftTemplate: (id) => db.shiftTemplates?.find((t) => t.id === id) || null,
    getTodayShift: (uid) => {
      const today = localDateToStr(new Date())
      return (db.schedules?.[uid] || []).find((s) => s.date === today) || null
    },
  }), [db])

  // ─── auth ──────────────────────────────────────────────────────────────────
  const login = (username, password) => {
    const user = db.users[username.trim().toLowerCase()]
    if (!user) return { ok: false, error: 'Incorrect username or password.' }
    if (user.mustSetPw) return { ok: true, setupRequired: true, userId: username.trim().toLowerCase() }
    if (user.password !== password) return { ok: false, error: 'Incorrect username or password.' }
    setCurrentUserId(username.trim().toLowerCase())
    return { ok: true }
  }

  const setupPassword = (userId, password) => {
    setDb((prev) => {
      const next = clone(prev)
      next.users[userId].password = password
      next.users[userId].mustSetPw = false
      return next
    })
    setCurrentUserId(userId)
  }

  const logout = () => {
    setCurrentUserId(null)
    setClockSession({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })
  }

  // ─── clock ─────────────────────────────────────────────────────────────────
  const clockIn = (branchId, { locOk = false } = {}) => {
    const branch = db.branches.find((b) => b.id === branchId) || db.branches[0]
    const session = { startedAt: new Date().toISOString(), branchId: branch.id, branchName: branch.name, locOk }
    setClockSession({ active: true, ...session })
    setDb((prev) => {
      const next = clone(prev)
      if (!next.activeSessions) next.activeSessions = {}
      next.activeSessions[currentUserId] = session
      return next
    })
  }

  const clockOut = () => {
    if (!clockSession.active || !currentUserId) return { phCredited: false, phName: '' }
    const startedAt  = new Date(clockSession.startedAt)
    const finishedAt = new Date()
    const diff = finishedAt - startedAt
    const hrs  = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    const rec = {
      date:       localDateToStr(startedAt),
      in:         startedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false }),
      out:        finishedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false }),
      hours:      `${hrs}h ${mins}m`,
      status:     'complete',
      branchId:   clockSession.branchId,
      branchName: clockSession.branchName,
      locOk:      clockSession.locOk,
    }
    let phCredited = false
    let phName = ''
    setDb((prev) => {
      const next = clone(prev)
      applyAttendanceTiming(currentUserId, rec, next)
      next.attendance[currentUserId] = [rec, ...(next.attendance[currentUserId] || [])]
      phCredited = creditPhOffInLieuIfNeeded(currentUserId, rec, next)
      phName = rec.phName || ''
      if (!next.activeSessions) next.activeSessions = {}
      delete next.activeSessions[currentUserId]
      return next
    })
    setClockSession({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })
    return { phCredited, phName }
  }

  // ─── leave ─────────────────────────────────────────────────────────────────
  const submitLeave = ({ type, start, end, reason, attachmentName = '', attachmentUrl = '' }) => {
    if (!currentUserId) return
    const days = Math.round((parseLocalDate(end) - parseLocalDate(start)) / 86400000) + 1
    setDb((prev) => {
      const next = clone(prev)
      if (!next.leaves[currentUserId]) next.leaves[currentUserId] = []
      next.leaves[currentUserId] = [
        { type, start, end, days, reason: reason || '—', attachmentName, attachmentUrl, status: 'pending' },
        ...next.leaves[currentUserId],
      ]
      return next
    })
  }

  const revokeLeave = (index) => {
    setDb((prev) => {
      const next = clone(prev)
      next.leaves[currentUserId].splice(index, 1)
      return next
    })
  }

  const actLeave = (uid, idx, status) => {
    setDb((prev) => {
      const next = clone(prev)
      const rec = next.leaves[uid][idx]
      const prevStatus = rec.status
      rec.status = status
      ensureUserBalance(uid, next)
      const bal = next.balances[uid][rec.type]
      if (bal) {
        if (prevStatus !== 'approved' && status === 'approved') bal.used += Number(rec.days) || 0
        if (prevStatus === 'approved' && status !== 'approved') bal.used = Math.max(0, bal.used - (Number(rec.days) || 0))
      }
      return next
    })
  }

  // ─── staff CRUD ────────────────────────────────────────────────────────────
  const addUser = ({ name, username, role, branchIds, reportsTo = null }) => {
    setDb((prev) => {
      const next = clone(prev)
      const uid = username.trim().toLowerCase().replace(/\s+/g, '')
      next.users[uid] = {
        name,
        initials: name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
        role,
        password: null,
        mustSetPw: true,
        branchIds,
        reportsTo,
        expectedStart: role === 'admin' ? '' : '09:00',
        expectedEnd:   role === 'admin' ? '' : '18:00',
        workDays: [...DEFAULT_WORK_DAYS],
        memo: '',
      }
      next.attendance[uid] = []
      next.leaves[uid]     = []
      next.schedules[uid]  = []
      next.balances[uid]   = Object.fromEntries(LEAVE_TYPES.map((t) => [t.id, { total: t.defaultDays, used: 0 }]))
      return next
    })
  }

  const saveStaff = (uid, payload) => {
    setDb((prev) => {
      const next = clone(prev)
      next.users[uid] = { ...next.users[uid], ...payload }
      ;(next.attendance[uid] || []).forEach((rec) => applyAttendanceTiming(uid, rec, next))
      return next
    })
  }

  const deleteUser = (uid) => {
    setDb((prev) => {
      const next = clone(prev)
      delete next.users[uid]
      delete next.attendance[uid]
      delete next.leaves[uid]
      delete next.balances[uid]
      delete next.schedules[uid]
      delete next.activeSessions?.[uid]
      // Re-assign subordinates to null
      Object.values(next.users).forEach((u) => { if (u.reportsTo === uid) u.reportsTo = null })
      return next
    })
  }

  const setBalance = (uid, leaveType, field, value) => {
    setDb((prev) => {
      const next = clone(prev)
      ensureUserBalance(uid, next)
      next.balances[uid][leaveType][field] = Math.max(0, Number(value) || 0)
      return next
    })
  }

  // ─── branch CRUD ───────────────────────────────────────────────────────────
  const addBranch = ({ name, address, lat, lng, radius = 100, color = '#7986CB' }) => {
    setDb((prev) => {
      const next = clone(prev)
      next.branches.push({ id: genId(), name, address, lat: Number(lat) || null, lng: Number(lng) || null, radius: Number(radius) || 100, color })
      return next
    })
  }

  const saveBranch = (id, payload) => {
    setDb((prev) => {
      const next = clone(prev)
      const idx = next.branches.findIndex((b) => b.id === id)
      if (idx >= 0) next.branches[idx] = { ...next.branches[idx], ...payload, lat: Number(payload.lat) || null, lng: Number(payload.lng) || null }
      return next
    })
  }

  const deleteBranch = (id) => {
    setDb((prev) => {
      const next = clone(prev)
      next.branches = next.branches.filter((b) => b.id !== id)
      Object.values(next.users).forEach((u) => { u.branchIds = (u.branchIds || []).filter((bid) => bid !== id) })
      return next
    })
  }

  // ─── shift templates ───────────────────────────────────────────────────────
  const addShiftTemplate = ({ name, startTime, endTime, color }) => {
    setDb((prev) => {
      const next = clone(prev)
      if (!next.shiftTemplates) next.shiftTemplates = []
      next.shiftTemplates.push({ id: genId(), name, startTime, endTime, color })
      return next
    })
  }

  const saveShiftTemplate = (id, payload) => {
    setDb((prev) => {
      const next = clone(prev)
      const idx = (next.shiftTemplates || []).findIndex((t) => t.id === id)
      if (idx >= 0) next.shiftTemplates[idx] = { ...next.shiftTemplates[idx], ...payload }
      return next
    })
  }

  const deleteShiftTemplate = (id) => {
    setDb((prev) => {
      const next = clone(prev)
      next.shiftTemplates = (next.shiftTemplates || []).filter((t) => t.id !== id)
      return next
    })
  }

  // ─── schedules ─────────────────────────────────────────────────────────────
  const assignShift = (uid, { date, branchId, templateId, startTime, endTime, note = '' }) => {
    setDb((prev) => {
      const next = clone(prev)
      if (!next.schedules) next.schedules = {}
      if (!next.schedules[uid]) next.schedules[uid] = []
      // Remove existing shift on same date
      next.schedules[uid] = next.schedules[uid].filter((s) => s.date !== date)
      next.schedules[uid].push({ id: genId(), date, branchId, templateId, startTime, endTime, note })
      return next
    })
  }

  const deleteShift = (uid, shiftId) => {
    setDb((prev) => {
      const next = clone(prev)
      if (next.schedules?.[uid]) next.schedules[uid] = next.schedules[uid].filter((s) => s.id !== shiftId)
      return next
    })
  }

  // ─── calendar events ───────────────────────────────────────────────────────
  const addCalendarEvent = ({ title, date, color }) => {
    setDb((prev) => {
      const next = clone(prev)
      if (!next.calendarEvents) next.calendarEvents = []
      next.calendarEvents.push({ id: genId(), title, date, color, createdBy: currentUserId })
      return next
    })
  }

  const deleteCalendarEvent = (id) => {
    setDb((prev) => {
      const next = clone(prev)
      next.calendarEvents = (next.calendarEvents || []).filter((e) => e.id !== id)
      return next
    })
  }

  return {
    db,
    currentUserId,
    currentUser,
    clockSession,
    helpers,
    workdayOptions: WORKDAY_OPTIONS,
    leaveTypes: LEAVE_TYPES,
    // auth
    login,
    setupPassword,
    logout,
    // clock
    clockIn,
    clockOut,
    // leave
    submitLeave,
    revokeLeave,
    actLeave,
    // staff
    addUser,
    saveStaff,
    deleteUser,
    setBalance,
    // branches
    addBranch,
    saveBranch,
    deleteBranch,
    // shift templates
    addShiftTemplate,
    saveShiftTemplate,
    deleteShiftTemplate,
    // schedules
    assignShift,
    deleteShift,
    // calendar
    addCalendarEvent,
    deleteCalendarEvent,
  }
}
