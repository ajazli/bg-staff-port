import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

function groupByUser(rows, transform) {
  const map = {}
  rows.forEach((row) => {
    const uid = row.user_id
    if (!map[uid]) map[uid] = []
    map[uid].push(transform(row))
  })
  return map
}

function transformUser(row) {
  return {
    name:          row.name,
    initials:      row.initials,
    role:          row.role,
    mustSetPw:     row.must_set_pw,
    branchIds:     row.branch_ids || [],
    reportsTo:     row.reports_to,
    expectedStart: row.expected_start || '',
    expectedEnd:   row.expected_end   || '',
    workDays:      row.work_days      || [1,2,3,4,5],
    memo:          row.memo           || '',
    avatarUrl:             row.avatar_url     || null,
    birthday:              row.birthday instanceof Date ? row.birthday.toISOString().slice(0, 10)
                           : row.birthday ? String(row.birthday).slice(0, 10) : null,
    breakAllowanceMinutes: row.break_allowance_minutes || 0,
    startDate:             row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10)
                           : row.start_date ? String(row.start_date).slice(0, 10) : null,
    uniformQuantity:       row.uniform_quantity ?? 0,
  }
}

function transformAttendance(row) {
  return {
    id:                 row.id,
    date:               row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    in:                 row.in_time,
    out:                row.out_time,
    hours:              row.hours,
    status:             row.status,
    branchId:           row.branch_id,
    branchName:         row.branch_name,
    locOk:              row.loc_ok,
    lateMinutes:        row.late_minutes,
    isLate:             row.is_late,
    earlyLeaveMinutes:  row.early_leave_minutes,
    leftEarly:          row.left_early,
    overtimeMinutes:    row.overtime_minutes,
    didOvertime:        row.did_overtime,
    expectedStart:      row.expected_start,
    expectedEnd:        row.expected_end,
    phName:             row.ph_name,
    phCreditAdded:      row.ph_credit_added,
    phCreditSkipped:    row.ph_credit_skipped,
    roleOfDay:          row.role_of_day || '',
    eodNote:            row.eod_note    || '',
    breakMinutes:       row.break_minutes || 0,
  }
}

function transformLeave(row) {
  return {
    id:             row.id,
    type:           row.type,
    start:          row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date),
    end:            row.end_date   instanceof Date ? row.end_date.toISOString().slice(0, 10)   : String(row.end_date),
    days:           row.days,
    reason:         row.reason,
    attachmentName: row.attachment_name,
    attachmentUrl:  row.attachment_url,
    status:         row.status,
  }
}

function transformSchedule(row) {
  return {
    id:           row.id,
    date:         row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    branchId:     row.branch_id,
    templateId:   row.template_id,
    startTime:    row.start_time,
    endTime:      row.end_time,
    note:         row.note,
    breakAllowed: row.break_allowed !== false,
  }
}

function transformTemplate(row) {
  return {
    id:        row.id,
    name:      row.name,
    startTime: row.start_time,
    endTime:   row.end_time,
    color:     row.color,
  }
}

function transformLeaveType(row) {
  return {
    id:           row.id,
    name:         row.name,
    label:        row.name,
    color:        row.color,
    defaultDays:  row.default_days,
    requiresFile: row.requires_file,
    sortOrder:    row.sort_order,
  }
}

function transformBreakage(row) {
  return {
    id:             row.id,
    userId:         row.user_id,
    date:           row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    time:           row.time || '',
    reason:         row.reason,
    attachmentName: row.attachment_name || '',
    attachmentUrl:  row.attachment_url  || '',
    createdAt:      row.created_at,
  }
}

router.get('/', authenticate, async (req, res) => {
  try {
    const uid   = req.user.userId
    const isAdmin = req.user.role === 'admin'

    const [
      usersRes, branchesRes, templatesRes,
      attendRes, leavesRes, balancesRes,
      schedulesRes, eventsRes, sessionsRes, breakagesRes, leaveTypesRes,
    ] = await Promise.all([
      pool.query('SELECT * FROM users ORDER BY created_at'),
      pool.query('SELECT * FROM branches ORDER BY name'),
      pool.query('SELECT * FROM shift_templates ORDER BY name'),
      pool.query('SELECT * FROM attendance ORDER BY date DESC, created_at DESC'),
      pool.query('SELECT * FROM leaves ORDER BY created_at DESC'),
      pool.query('SELECT * FROM leave_balances'),
      pool.query('SELECT * FROM schedules ORDER BY date'),
      pool.query('SELECT * FROM calendar_events ORDER BY date'),
      pool.query('SELECT * FROM active_sessions'),
      isAdmin
        ? pool.query('SELECT * FROM breakages ORDER BY date DESC, created_at DESC')
        : pool.query('SELECT * FROM breakages WHERE user_id=$1 ORDER BY date DESC, created_at DESC', [uid]),
      pool.query('SELECT * FROM leave_types ORDER BY sort_order, name'),
    ])

    // Build users map
    const users = {}
    usersRes.rows.forEach((row) => { users[row.id] = transformUser(row) })

    const attendMap    = groupByUser(attendRes.rows,    transformAttendance)
    const leavesMap    = groupByUser(leavesRes.rows,    transformLeave)
    const schedulesMap = groupByUser(schedulesRes.rows, transformSchedule)
    const breakagesMap = groupByUser(breakagesRes.rows, transformBreakage)

    // Ensure every user has an entry in all maps
    Object.keys(users).forEach((uid) => {
      if (!attendMap[uid])    attendMap[uid]    = []
      if (!leavesMap[uid])    leavesMap[uid]    = []
      if (!schedulesMap[uid]) schedulesMap[uid] = []
      if (!breakagesMap[uid]) breakagesMap[uid] = []
    })

    // Build balances: { userId: { leaveType: { total, used } } }
    const balances = {}
    balancesRes.rows.forEach((row) => {
      if (!balances[row.user_id]) balances[row.user_id] = {}
      balances[row.user_id][row.leave_type] = { total: row.total, used: row.used }
    })

    // Active sessions: { userId: { startedAt, branchId, branchName, locOk, onBreak, breakStartedAt, totalBreakMinutes } }
    const activeSessions = {}
    sessionsRes.rows.forEach((row) => {
      activeSessions[row.user_id] = {
        startedAt:         row.started_at,
        branchId:          row.branch_id,
        branchName:        row.branch_name,
        locOk:             row.loc_ok,
        onBreak:           row.on_break || false,
        breakStartedAt:    row.break_started_at || null,
        totalBreakMinutes: row.total_break_minutes || 0,
        roleOfDay:         row.role_of_day || '',
      }
    })

    res.json({
      users,
      branches:       branchesRes.rows.map((b) => ({ ...b, lat: b.lat ? Number(b.lat) : null, lng: b.lng ? Number(b.lng) : null })),
      shiftTemplates: templatesRes.rows.map(transformTemplate),
      attendance:     attendMap,
      leaves:         leavesMap,
      balances,
      schedules:      schedulesMap,
      calendarEvents: eventsRes.rows.map((e) => ({
        id:        e.id,
        title:     e.title,
        date:      e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date),
        color:     e.color,
        createdBy: e.created_by,
      })),
      activeSessions,
      breakages: breakagesMap,
      leaveTypes: leaveTypesRes.rows.map(transformLeaveType),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load app data' })
  }
})

// Lightweight endpoint — only active sessions, used for live-attendance polling
router.get('/active-sessions', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM active_sessions')
    const activeSessions = {}
    rows.forEach((row) => {
      activeSessions[row.user_id] = {
        startedAt:         row.started_at,
        branchId:          row.branch_id,
        branchName:        row.branch_name,
        locOk:             row.loc_ok,
        onBreak:           row.on_break || false,
        breakStartedAt:    row.break_started_at || null,
        totalBreakMinutes: row.total_break_minutes || 0,
        roleOfDay:         row.role_of_day || '',
      }
    })
    res.json(activeSessions)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
