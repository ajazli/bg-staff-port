import { useCallback, useEffect, useMemo, useState } from 'react'
import { LEAVE_TYPES, WORKDAY_OPTIONS } from '../data/mockData'
import { api, clearToken, getToken, setToken } from '../api'

export function usePortalState() {
  const [db,             setDb]             = useState(null)
  const [currentUserId,  setCurrentUserId]  = useState(null)
  const [clockSession,   setClockSession]   = useState({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })
  const [loading,        setLoading]        = useState(true)

  // ─── load all app data from server ────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const data = await api.getAppData()
      setDb(data)
      return data
    } catch (err) {
      console.error('Failed to load app data:', err)
      throw err
    }
  }, [])

  // On mount: if JWT exists, restore session
  useEffect(() => {
    if (!getToken()) { setLoading(false); return }
    api.me()
      .then(async (me) => {
        if (!me) return
        const data = await loadData()
        setCurrentUserId(me.id)
        // Restore active clock session if server shows one
        const session = data?.activeSessions?.[me.id]
        if (session) setClockSession({ active: true, startedAt: session.startedAt, branchId: session.branchId, branchName: session.branchName, locOk: session.locOk })
      })
      .catch(() => { clearToken() })
      .finally(() => setLoading(false))
  }, [loadData])

  const currentUser = db && currentUserId ? db.users[currentUserId] : null

  // ─── helpers (memoised, same interface as before) ──────────────────────────
  const helpers = useMemo(() => {
    if (!db) return {}
    return {
      fmtDate: (d) => {
        if (!d) return '—'
        const [y, m, day] = String(d).slice(0, 10).split('-')
        const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        return `${day} ${mn[Number(m) - 1]} ${y}`
      },
      cap: (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : ''),
      getBranch:        (id) => db.branches.find((b) => b.id === id) || null,
      getUserBranches:  (uid) => (db.users[uid]?.branchIds || []).map((id) => db.branches.find((b) => b.id === id)).filter(Boolean),
      getBalanceRemaining: (uid, col) => {
        const bal = db.balances[uid]?.[col] || { total: 0, used: 0 }
        return bal.total - bal.used
      },
      getTimingBadges: (record) => {
        const badges = []
        if (record.expectedStart) badges.push(record.isLate ? `Late (${record.lateMinutes}m)` : 'On time')
        if (record.expectedEnd) {
          if (record.leftEarly)    badges.push(`Left early (${record.earlyLeaveMinutes}m)`)
          else if (record.didOvertime) badges.push(`Overtime (${record.overtimeMinutes}m)`)
          else                         badges.push('On end time')
        }
        return badges
      },
      getUserWorkDays: (uid) => {
        const days = db.users[uid]?.workDays
        return Array.isArray(days) && days.length ? days.map(Number) : [1,2,3,4,5]
      },
      getDirectReports: (uid) =>
        Object.entries(db.users)
          .filter(([id, u]) => u.reportsTo === uid && id !== uid)
          .map(([id, u]) => ({ id, ...u })),
      getAllSubordinates: (uid) => {
        const result = []
        const queue  = [uid]
        while (queue.length) {
          const cur = queue.shift()
          Object.entries(db.users).forEach(([id, u]) => {
            if (u.reportsTo === cur && id !== uid) { result.push(id); queue.push(id) }
          })
        }
        return result
      },
      getLeaveType:     (id)  => LEAVE_TYPES.find((t) => t.id === id) || null,
      getShiftTemplate: (id)  => (db.shiftTemplates || []).find((t) => t.id === id) || null,
      getTodayShift: (uid) => {
        const today = new Date().toISOString().slice(0, 10)
        return (db.schedules?.[uid] || []).find((s) => s.date === today) || null
      },
    }
  }, [db])

  // ─── auth ──────────────────────────────────────────────────────────────────
  const login = async (username, password) => {
    try {
      const result = await api.login(username, password)
      if (!result.ok) return { ok: false, error: 'Incorrect username or password.' }
      if (result.setupRequired) return { ok: true, setupRequired: true, userId: result.userId }
      setToken(result.token)
      const data = await loadData()
      const uid  = username.trim().toLowerCase()
      setCurrentUserId(uid)
      const session = data?.activeSessions?.[uid]
      if (session) setClockSession({ active: true, ...session })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message || 'Login failed.' }
    }
  }

  const setupPassword = async (userId, password) => {
    try {
      const result = await api.setupPassword(userId, password)
      setToken(result.token)
      await loadData()
      setCurrentUserId(userId)
    } catch (err) {
      console.error('Setup password failed:', err)
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    await api.changePassword(currentPassword, newPassword)
  }

  const resetPassword = async (uid, newPassword) => {
    await api.resetPassword(uid, newPassword)
  }

  const logout = () => {
    clearToken()
    setCurrentUserId(null)
    setDb(null)
    setClockSession({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })
  }

  // ─── clock ─────────────────────────────────────────────────────────────────
  const clockIn = async (branchId, { locOk = false } = {}) => {
    const result = await api.clockIn(branchId, locOk)
    const branch = db?.branches.find((b) => b.id === branchId)
    const session = { active: true, startedAt: new Date().toISOString(), branchId, branchName: result.branchName || branch?.name || '', locOk }
    setClockSession(session)
    setDb((prev) => ({
      ...prev,
      activeSessions: { ...prev.activeSessions, [currentUserId]: { startedAt: session.startedAt, branchId, branchName: session.branchName, locOk } },
    }))
  }

  const clockOut = async () => {
    try {
      const result = await api.clockOut()
      setClockSession({ active: false, startedAt: null, branchId: '', branchName: '', locOk: false })
      // Reload data to get the new attendance record and updated balances
      await loadData()
      return { phCredited: result.phCredited, phName: result.phName }
    } catch (err) {
      console.error('Clock-out failed:', err)
      return { phCredited: false, phName: '' }
    }
  }

  // ─── leave ─────────────────────────────────────────────────────────────────
  const submitLeave = async ({ type, start, end, reason, attachmentName = '', attachmentUrl = '' }) => {
    const row = await api.submitLeave({ type, start, end, reason, attachmentName, attachmentUrl })
    const newLeave = {
      id: row.id, type, start, end,
      days: Math.round((new Date(end) - new Date(start)) / 86400000) + 1,
      reason: reason || '—', attachmentName, attachmentUrl, status: 'pending',
    }
    setDb((prev) => ({
      ...prev,
      leaves: { ...prev.leaves, [currentUserId]: [newLeave, ...(prev.leaves[currentUserId] || [])] },
    }))
  }

  const revokeLeave = async (leaveId) => {
    await api.revokeLeave(leaveId)
    setDb((prev) => ({
      ...prev,
      leaves: { ...prev.leaves, [currentUserId]: (prev.leaves[currentUserId] || []).filter((l) => l.id !== leaveId) },
    }))
  }

  const actLeave = async (uid, leaveId, status) => {
    await api.actLeave(leaveId, status)
    // Reload to get updated balances
    await loadData()
  }

  // ─── staff CRUD ────────────────────────────────────────────────────────────
  const addUser = async ({ name, username, role, branchIds, reportsTo }) => {
    await api.createUser({ name, username, role, branchIds, reportsTo })
    await loadData()
  }

  const saveStaff = async (uid, payload) => {
    await api.updateUser(uid, payload)
    setDb((prev) => ({
      ...prev,
      users: { ...prev.users, [uid]: { ...prev.users[uid], ...payload } },
    }))
  }

  const deleteUser = async (uid) => {
    await api.deleteUser(uid)
    setDb((prev) => {
      const next = { ...prev }
      const users = { ...next.users }; delete users[uid]
      const attendance = { ...next.attendance }; delete attendance[uid]
      const leaves     = { ...next.leaves };     delete leaves[uid]
      const balances   = { ...next.balances };   delete balances[uid]
      const schedules  = { ...next.schedules };  delete schedules[uid]
      const activeSessions = { ...next.activeSessions }; delete activeSessions[uid]
      Object.keys(users).forEach((id) => { if (users[id].reportsTo === uid) users[id] = { ...users[id], reportsTo: null } })
      return { ...next, users, attendance, leaves, balances, schedules, activeSessions }
    })
  }

  const setBalance = async (uid, leaveType, field, value) => {
    await api.setBalance(uid, leaveType, field, value)
    setDb((prev) => ({
      ...prev,
      balances: {
        ...prev.balances,
        [uid]: {
          ...prev.balances[uid],
          [leaveType]: { ...prev.balances[uid]?.[leaveType], [field]: Math.max(0, Number(value) || 0) },
        },
      },
    }))
  }

  // ─── branch CRUD ───────────────────────────────────────────────────────────
  const addBranch = async (data) => {
    const row = await api.createBranch(data)
    setDb((prev) => ({ ...prev, branches: [...prev.branches, { ...row, lat: row.lat ? Number(row.lat) : null, lng: row.lng ? Number(row.lng) : null }] }))
  }

  const saveBranch = async (id, data) => {
    const row = await api.updateBranch(id, data)
    setDb((prev) => ({ ...prev, branches: prev.branches.map((b) => b.id === id ? { ...row, lat: row.lat ? Number(row.lat) : null, lng: row.lng ? Number(row.lng) : null } : b) }))
  }

  const deleteBranch = async (id) => {
    await api.deleteBranch(id)
    setDb((prev) => ({
      ...prev,
      branches: prev.branches.filter((b) => b.id !== id),
      users: Object.fromEntries(
        Object.entries(prev.users).map(([uid, u]) => [uid, { ...u, branchIds: (u.branchIds || []).filter((bid) => bid !== id) }])
      ),
    }))
  }

  // ─── shift templates ───────────────────────────────────────────────────────
  const addShiftTemplate = async (data) => {
    const row = await api.createTemplate(data)
    setDb((prev) => ({ ...prev, shiftTemplates: [...(prev.shiftTemplates || []), { id: row.id, name: row.name, startTime: row.start_time, endTime: row.end_time, color: row.color }] }))
  }

  const saveShiftTemplate = async (id, data) => {
    const row = await api.updateTemplate(id, data)
    setDb((prev) => ({
      ...prev,
      shiftTemplates: (prev.shiftTemplates || []).map((t) =>
        t.id === id ? { id: row.id, name: row.name, startTime: row.start_time, endTime: row.end_time, color: row.color } : t
      ),
    }))
  }

  const deleteShiftTemplate = async (id) => {
    await api.deleteTemplate(id)
    setDb((prev) => ({ ...prev, shiftTemplates: (prev.shiftTemplates || []).filter((t) => t.id !== id) }))
  }

  // ─── schedules ─────────────────────────────────────────────────────────────
  const assignShift = async (uid, { date, branchId, templateId, startTime, endTime, note = '' }) => {
    const row = await api.assignShift({ userId: uid, date, branchId, templateId, startTime, endTime, note })
    const newShift = { id: row.id, date: row.date?.slice?.(0, 10) || date, branchId: row.branch_id || branchId, templateId: row.template_id || templateId, startTime: row.start_time || startTime, endTime: row.end_time || endTime, note: row.note || note }
    setDb((prev) => ({
      ...prev,
      schedules: {
        ...prev.schedules,
        [uid]: [...(prev.schedules?.[uid] || []).filter((s) => s.date !== date), newShift],
      },
    }))
  }

  const deleteShift = async (uid, shiftId) => {
    await api.deleteShift(shiftId)
    setDb((prev) => ({
      ...prev,
      schedules: { ...prev.schedules, [uid]: (prev.schedules?.[uid] || []).filter((s) => s.id !== shiftId) },
    }))
  }

  // ─── breakages ─────────────────────────────────────────────────────────────
  const submitBreakage = async ({ date, time, reason, attachmentName = '', attachmentUrl = '' }) => {
    const row = await api.submitBreakage({ date, time, reason, attachmentName, attachmentUrl })
    const entry = {
      id: row.id, userId: currentUserId, date, time, reason,
      attachmentName, attachmentUrl, createdAt: row.created_at,
    }
    setDb((prev) => ({
      ...prev,
      breakages: {
        ...prev.breakages,
        [currentUserId]: [entry, ...(prev.breakages?.[currentUserId] || [])],
      },
    }))
  }

  // ─── calendar events ───────────────────────────────────────────────────────
  const addCalendarEvent = async ({ title, date, color }) => {
    const row = await api.createEvent({ title, date, color })
    setDb((prev) => ({
      ...prev,
      calendarEvents: [...(prev.calendarEvents || []), { id: row.id, title: row.title, date: String(row.date).slice(0, 10), color: row.color, createdBy: row.created_by }],
    }))
  }

  const deleteCalendarEvent = async (id) => {
    await api.deleteEvent(id)
    setDb((prev) => ({ ...prev, calendarEvents: (prev.calendarEvents || []).filter((e) => e.id !== id) }))
  }

  return {
    db,
    loading,
    currentUserId,
    currentUser,
    clockSession,
    helpers,
    leaveTypes:     LEAVE_TYPES,
    workdayOptions: WORKDAY_OPTIONS,
    // auth
    login,
    setupPassword,
    changePassword,
    resetPassword,
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
    // breakages
    submitBreakage,
  }
}
