import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

function toMins(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}
function padTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}
const CLOCK_IN_EARLY_MINS = 60  // allow clock-in this many minutes before shift start

router.post('/clock-in', async (req, res) => {
  try {
    const uid               = req.user.userId
    const { branchId, locOk = false } = req.body

    const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId])
    const branch    = branchRes.rows[0]
    if (!branch) return res.status(400).json({ error: 'Branch not found' })

    // SG time
    const sgNow    = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
    const todayStr = sgNow.toLocaleDateString('en-CA')
    const nowMins  = sgNow.getHours() * 60 + sgNow.getMinutes()
    const inTime   = `${String(sgNow.getHours()).padStart(2,'0')}:${String(sgNow.getMinutes()).padStart(2,'0')}`

    if (req.user.role !== 'admin') {
      // 1. Must have a shift scheduled today
      const { rows: shiftRows } = await pool.query(
        'SELECT * FROM schedules WHERE user_id=$1 AND date=$2', [uid, todayStr]
      )
      if (shiftRows.length === 0) {
        return res.status(403).json({ error: 'You are not scheduled to work today.' })
      }

      const shift = shiftRows[0]

      // 2. Shift timing: allow from CLOCK_IN_EARLY_MINS before start up to shift end
      if (shift.start_time && shift.end_time) {
        const startMins = toMins(shift.start_time)
        const endMins   = toMins(shift.end_time)
        const openMins  = startMins - CLOCK_IN_EARLY_MINS

        if (nowMins < openMins) {
          return res.status(403).json({
            error: `Too early — clock-in opens at ${padTime(openMins)} (${CLOCK_IN_EARLY_MINS} min before your ${shift.start_time} shift).`
          })
        }
        if (nowMins >= endMins) {
          return res.status(403).json({
            error: `Your shift ended at ${shift.end_time}. Contact your manager if this is an error.`
          })
        }
      }

      // 3. Location: if branch has GPS, locOk must be true
      if (branch.lat && branch.lng && !locOk) {
        return res.status(403).json({ error: 'You must be at the branch location to clock in.' })
      }
    }

    // Get user expected times for late calculation
    const { rows: userRows } = await pool.query(
      'SELECT expected_start, expected_end FROM users WHERE id=$1', [uid]
    )
    const userRec       = userRows[0] || {}
    const expectedStart = userRec.expected_start || ''
    const expectedEnd   = userRec.expected_end   || ''

    let lateMinutes = 0, isLate = false
    if (expectedStart) {
      lateMinutes = Math.max(0, nowMins - toMins(expectedStart))
      isLate      = lateMinutes > 0
    }

    // Upsert active session
    await pool.query(
      `INSERT INTO active_sessions (user_id, started_at, branch_id, branch_name, loc_ok)
       VALUES ($1, NOW(), $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET started_at=NOW(), branch_id=$2, branch_name=$3, loc_ok=$4,
         on_break=false, break_started_at=NULL, total_break_minutes=0, role_of_day=NULL`,
      [uid, branch.id, branch.name, locOk]
    )

    // Write attendance record for today
    await pool.query(
      `INSERT INTO attendance
         (user_id, date, in_time, status, branch_id, branch_name, loc_ok,
          expected_start, expected_end, late_minutes, is_late)
       VALUES ($1,$2,$3,'complete',$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, date) DO UPDATE
         SET in_time=$3, branch_id=$4, branch_name=$5, loc_ok=$6,
             late_minutes=$9, is_late=$10`,
      [uid, todayStr, inTime, branch.id, branch.name, locOk,
       expectedStart, expectedEnd, lateMinutes, isLate]
    )

    res.json({ ok: true, branchName: branch.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/role-of-day', async (req, res) => {
  try {
    const uid  = req.user.userId
    const { role } = req.body
    if (!role) return res.status(400).json({ error: 'Role required' })
    await pool.query('UPDATE active_sessions SET role_of_day=$1 WHERE user_id=$2', [role, uid])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})


router.post('/break-start', async (req, res) => {
  try {
    const uid = req.user.userId
    const { rows } = await pool.query('SELECT * FROM active_sessions WHERE user_id=$1', [uid])
    const session = rows[0]
    if (!session) return res.status(400).json({ error: 'No active clock-in session' })
    if (session.on_break) return res.status(400).json({ error: 'Already on break' })

    // Feature 4: check if break is allowed for today's shift
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
    const { rows: schedRows } = await pool.query('SELECT break_allowed FROM schedules WHERE user_id=$1 AND date=$2', [uid, today])
    if (schedRows[0] && schedRows[0].break_allowed === false) {
      return res.status(403).json({ error: 'Break not allowed for your shift today' })
    }

    await pool.query(
      'UPDATE active_sessions SET on_break=true, break_started_at=NOW() WHERE user_id=$1', [uid]
    )
    res.json({ ok: true, breakStartedAt: new Date().toISOString() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/break-end', async (req, res) => {
  try {
    const uid = req.user.userId
    const { rows } = await pool.query('SELECT * FROM active_sessions WHERE user_id=$1', [uid])
    const session = rows[0]
    if (!session) return res.status(400).json({ error: 'No active clock-in session' })
    if (!session.on_break) return res.status(400).json({ error: 'Not on break' })
    const breakMins = session.break_started_at
      ? Math.max(0, Math.round((Date.now() - new Date(session.break_started_at)) / 60000))
      : 0
    await pool.query(
      `UPDATE active_sessions SET on_break=false, break_started_at=NULL,
       total_break_minutes=total_break_minutes+$1 WHERE user_id=$2`,
      [breakMins, uid]
    )
    res.json({ ok: true, breakMinutes: breakMins })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
