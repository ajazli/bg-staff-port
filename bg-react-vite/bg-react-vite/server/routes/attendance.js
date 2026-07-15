import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.post('/clock-in', async (req, res) => {
  try {
    const uid      = req.user.userId
    const { branchId, locOk = false } = req.body
    const branchRes = await pool.query('SELECT * FROM branches WHERE id = $1', [branchId])
    const branch    = branchRes.rows[0]
    if (!branch) return res.status(400).json({ error: 'Branch not found' })

    // Feature 8: if staff uses the schedule system, enforce shift-today requirement
    if (req.user.role !== 'admin') {
      const { rows: hasSchedules } = await pool.query('SELECT id FROM schedules WHERE user_id=$1 LIMIT 1', [uid])
      if (hasSchedules.length > 0) {
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
        const { rows: todayShift } = await pool.query('SELECT id FROM schedules WHERE user_id=$1 AND date=$2', [uid, todayStr])
        if (todayShift.length === 0) {
          return res.status(403).json({ error: 'You have no shift scheduled for today.' })
        }
      }
    }

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
