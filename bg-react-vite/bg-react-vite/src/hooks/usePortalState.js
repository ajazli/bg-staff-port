import { useEffect, useMemo, useState } from 'react'
import { initialData, LEAVE_COLS, SG_PUBLIC_HOLIDAYS, WORKDAY_OPTIONS } from '../data/mockData'

const storageKey = 'bg-staff-react-vite-state'

const clone = (value) => JSON.parse(JSON.stringify(value))
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

function parseLocalDate(dateStr) {
  return dateStr ? new Date(`${dateStr}T00:00:00`) : null
}

function localDateToStr(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function timeStrToMinutes(str) {
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return null
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

function seedState() {
  const saved = localStorage.getItem(storageKey)
  return saved ? JSON.parse(saved) : clone(initialData)
}

export function usePortalState() {
  const [db, setDb] = useState(seedState)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [clockSession, setClockSession] = useState({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(db))
  }, [db])

  const ensureUserBalance = (uid, nextDb) => {
    const target = nextDb ?? db
    if (!target.balances[uid]) target.balances[uid] = {}
    LEAVE_COLS.forEach((col) => {
      if (!target.balances[uid][col]) target.balances[uid][col] = { total: 0, used: 0 }
    })
  }

  const getUserWorkDays = (uid, sourceDb = db) => {
    const days = sourceDb.users[uid]?.workDays
    return Array.isArray(days) && days.length ? days.map(Number) : [...DEFAULT_WORK_DAYS]
  }

  const isScheduledWorkDay = (uid, dateStr, sourceDb = db) => {
    const dt = parseLocalDate(dateStr)
    if (!dt) return false
    return getUserWorkDays(uid, sourceDb).includes(dt.getDay())
  }

  const applyAttendanceTiming = (uid, record, sourceDb = db) => {
    const user = sourceDb.users[uid]
    const expectedStart = isScheduledWorkDay(uid, record.date, sourceDb) ? user?.expectedStart || '' : ''
    const expectedEnd = isScheduledWorkDay(uid, record.date, sourceDb) ? user?.expectedEnd || '' : ''
    record.expectedStart = expectedStart
    record.expectedEnd = expectedEnd

    const inMins = timeStrToMinutes(record.in)
    const expStartMins = timeStrToMinutes(expectedStart)
    record.lateMinutes = inMins !== null && expStartMins !== null ? Math.max(0, inMins - expStartMins) : 0
    record.isLate = record.lateMinutes > 0

    const outMins = timeStrToMinutes(record.out)
    const expEndMins = timeStrToMinutes(expectedEnd)
    record.earlyLeaveMinutes = outMins !== null && expEndMins !== null ? Math.max(0, expEndMins - outMins) : 0
    record.leftEarly = record.earlyLeaveMinutes > 0
    record.overtimeMinutes = outMins !== null && expEndMins !== null ? Math.max(0, outMins - expEndMins) : 0
    record.didOvertime = record.overtimeMinutes > 0
  }

  const creditPhOffInLieuIfNeeded = (uid, record, sourceDb = db) => {
    ensureUserBalance(uid, sourceDb)
    const ph = SG_PUBLIC_HOLIDAYS[record.date]
    if (!ph) {
      record.phName = ''
      return false
    }
    record.phName = ph.name
    if (!isScheduledWorkDay(uid, record.date, sourceDb)) {
      record.phCreditAdded = false
      record.phCreditSkipped = true
      return false
    }
    if (record.phCreditAdded) return false
    record.phCreditAdded = true
    record.phCreditSkipped = false
    sourceDb.balances[uid]['PH off in lieu'].total += 1
    return true
  }

  useEffect(() => {
    setDb((prev) => {
      const next = clone(prev)
      Object.entries(next.attendance).forEach(([uid, records]) => {
        records.forEach((record) => {
          applyAttendanceTiming(uid, record, next)
          creditPhOffInLieuIfNeeded(uid, record, next)
        })
      })
      return next
    })
  }, [])

  const currentUser = currentUserId ? db.users[currentUserId] : null

  const helpers = useMemo(() => ({
    fmtDate: (d) => {
      if (!d) return '—'
      const [y, m, day] = d.split('-')
      const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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
  }), [db])

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

  const clockIn = (branchId) => {
    const branch = db.branches.find((item) => item.id === branchId) || db.branches[0]
    setClockSession({ active: true, startedAt: new Date().toISOString(), branchId: branch.id, branchName: branch.name, locOk: true })
  }

  const clockOut = () => {
    if (!clockSession.active || !currentUserId) return { phCredited: false, phName: '' }
    const startedAt = new Date(clockSession.startedAt)
    const finishedAt = new Date()
    const diff = finishedAt - startedAt
    const hrs = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    const rec = {
      date: localDateToStr(startedAt),
      in: startedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false }),
      out: finishedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false }),
      hours: `${hrs}h ${mins}m`,
      status: 'complete',
      branchId: clockSession.branchId,
      branchName: clockSession.branchName,
      locOk: clockSession.locOk,
    }

    let phCredited = false
    let phName = ''

    setDb((prev) => {
      const next = clone(prev)
      applyAttendanceTiming(currentUserId, rec, next)
      next.attendance[currentUserId] = [rec, ...(next.attendance[currentUserId] || [])]
      phCredited = creditPhOffInLieuIfNeeded(currentUserId, rec, next)
      phName = rec.phName || ''
      return next
    })

    setClockSession({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })
    return { phCredited, phName }
  }

  const submitLeave = ({ type, start, end, reason, attachmentName = '', attachmentUrl = '' }) => {
    if (!currentUserId) return
    const days = Math.round((parseLocalDate(end) - parseLocalDate(start)) / 86400000) + 1
    setDb((prev) => {
      const next = clone(prev)
      next.leaves[currentUserId] = [{ type, start, end, days, reason: reason || '—', attachmentName, attachmentUrl, status: 'pending' }, ...(next.leaves[currentUserId] || [])]
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
      if (prevStatus !== 'approved' && status === 'approved' && next.balances[uid][rec.type]) next.balances[uid][rec.type].used += Number(rec.days) || 0
      if (prevStatus === 'approved' && status !== 'approved' && next.balances[uid][rec.type]) next.balances[uid][rec.type].used = Math.max(0, next.balances[uid][rec.type].used - (Number(rec.days) || 0))
      return next
    })
  }

  const saveStaff = (uid, payload) => {
    setDb((prev) => {
      const next = clone(prev)
      next.users[uid] = { ...next.users[uid], ...payload }
      Object.values(next.attendance[uid] || {}).forEach?.(() => {})
      ;(next.attendance[uid] || []).forEach((record) => applyAttendanceTiming(uid, record, next))
      return next
    })
  }

  const addUser = ({ name, username, role, branchIds }) => {
    setDb((prev) => {
      const next = clone(prev)
      next.users[username] = {
        name,
        initials: name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        role,
        password: null,
        mustSetPw: true,
        branchIds,
        expectedStart: role === 'admin' ? '' : '09:00',
        expectedEnd: role === 'admin' ? '' : '18:00',
        workDays: [...DEFAULT_WORK_DAYS],
        memo: '',
      }
      next.attendance[username] = []
      next.leaves[username] = []
      next.balances[username] = { 'Annual leave': { total: 14, used: 0 }, 'Medical leave': { total: 14, used: 0 }, 'PH off in lieu': { total: 0, used: 0 }, 'Emergency leave': { total: 3, used: 0 } }
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
    login,
    setupPassword,
    logout,
    clockIn,
    clockOut,
    submitLeave,
    revokeLeave,
    actLeave,
    saveStaff,
    addUser,
    setDb,
  }
}
