import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'
import { SG_PUBLIC_HOLIDAYS } from '../../src/data/mockData.js'

const router = Router()
router.use(authenticate)

function timeStrToMinutes(str) {
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return null
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

function localDateStr(dt) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

router.post('/clock-in', async (req, res) => {
  try {
    const uid      = req.user.userId
    const { branchId, locOk = false } = req.body
    const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId])
    const branch    = branchRes.rows[0]
    if (!branch) return res.status(400).json({ error: 'Branch not found' })

    await pool.query(
      `INSERT INTO active_sessions (user_id, started_at, branch_id, branch_name, loc_ok)
       VALUES ($1, NOW(), $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET started_at=NOW(), branch_id=$2, branch_name=$3, loc_ok=$4`,
      [uid, branch.id, branch.name, locOk]
    )
    res.json({ ok: true, branchName: branch.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/clock-out', async (req, res) => {
  try {
    const uid = req.user.userId
    const sessRes = await pool.query('SELECT * FROM active_sessions WHERE user_id = $1', [uid])
    const session  = sessRes.rows[0]
    if (!session) return res.status(400).json({ error: 'No active clock-in session' })

    const startedAt  = new Date(session.started_at)
    const finishedAt = new Date()
    const diff  = finishedAt - startedAt
    const hrs   = Math.floor(diff / 3600000)
    const mins  = Math.floor((diff % 3600000) / 60000)
    const dateStr = localDateStr(startedAt)
    const inTime  = startedAt.toLocaleTimeString('en-SG',  { hour: '2-digit', minute: '2-digit', hour12: false })
    const outTime = finishedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })

    // Get user's schedule / expected times for this date
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [uid])
    const user    = userRes.rows[0]
    const workDays = user.work_days || [1, 2, 3, 4, 5]
    const dayOfWeek = startedAt.getDay()
    const isWorkDay = workDays.includes(dayOfWeek)

    // Check if today has a scheduled shift
    const shiftRes = await pool.query('SELECT * FROM schedules WHERE user_id=$1 AND date=$2', [uid, dateStr])
    const shift = shiftRes.rows[0]

    const expectedStart = isWorkDay ? (shift?.start_time || user.expected_start || '') : ''
    const expectedEnd   = isWorkDay ? (shift?.end_time   || user.expected_end   || '') : ''

    const inMins     = timeStrToMinutes(inTime)
    const expStartMins = timeStrToMinutes(expectedStart)
    const outMins    = timeStrToMinutes(outTime)
    const expEndMins = timeStrToMinutes(expectedEnd)

    const lateMinutes        = inMins !== null && expStartMins !== null ? Math.max(0, inMins - expStartMins) : 0
    const earlyLeaveMinutes  = outMins !== null && expEndMins !== null  ? Math.max(0, expEndMins - outMins)  : 0
    const overtimeMinutes    = outMins !== null && expEndMins !== null  ? Math.max(0, outMins - expEndMins)  : 0

    // PH credit
    const ph      = SG_PUBLIC_HOLIDAYS[dateStr]
    let phName    = ph?.name || ''
    let phCreditAdded = false
    let phCreditSkipped = false

    await pool.query('BEGIN')

    if (ph && isWorkDay) {
      // Check if PH credit already given for this date
      const existing = await pool.query(
        'SELECT id FROM attendance WHERE user_id=$1 AND date=$2 AND ph_credit_added=true',
        [uid, dateStr]
      )
      if (existing.rows.length === 0) {
        phCreditAdded = true
        await pool.query(
          `INSERT INTO leave_balances (user_id, leave_type, total, used) VALUES ($1,'PH Off-in-Lieu',1,0)
           ON CONFLICT (user_id, leave_type) DO UPDATE SET total = leave_balances.total + 1`,
          [uid]
        )
      }
    } else if (ph && !isWorkDay) {
      phCreditSkipped = true
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance
         (user_id, date, in_time, out_time, hours, status, branch_id, branch_name, loc_ok,
          late_minutes, is_late, early_leave_minutes, left_early, overtime_minutes, did_overtime,
          expected_start, expected_end, ph_name, ph_credit_added, ph_credit_skipped)
       VALUES ($1,$2,$3,$4,$5,'complete',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [uid, dateStr, inTime, outTime, `${hrs}h ${mins}m`,
       session.branch_id, session.branch_name, session.loc_ok,
       lateMinutes, lateMinutes > 0,
       earlyLeaveMinutes, earlyLeaveMinutes > 0,
       overtimeMinutes, overtimeMinutes > 0,
       expectedStart, expectedEnd,
       phName, phCreditAdded, phCreditSkipped]
    )

    await pool.query('DELETE FROM active_sessions WHERE user_id = $1', [uid])
    await pool.query('COMMIT')

    res.json({ ok: true, phCredited: phCreditAdded, phName, record: rows[0] })
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
