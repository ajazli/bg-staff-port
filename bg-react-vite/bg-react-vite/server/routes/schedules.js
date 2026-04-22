import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// Helper: check if requester can manage target user's schedule
async function canManage(requesterId, requesterRole, targetUserId) {
  if (requesterRole === 'admin') return true
  if (requesterRole === 'team_lead') {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE id=$1 AND reports_to=$2',
      [targetUserId, requesterId]
    )
    return rows.length > 0
  }
  return false
}

router.post('/', async (req, res) => {
  try {
    const { userId, date, branchId, templateId, startTime, endTime, note = '', breakAllowed = true } = req.body
    if (!userId || !date || !branchId) return res.status(400).json({ error: 'userId, date and branchId required' })

    if (!(await canManage(req.user.userId, req.user.role, userId))) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { rows } = await pool.query(
      `INSERT INTO schedules (user_id, date, branch_id, template_id, start_time, end_time, note, break_allowed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, date) DO UPDATE
         SET branch_id=$3, template_id=$4, start_time=$5, end_time=$6, note=$7, break_allowed=$8
       RETURNING *`,
      [userId, date, branchId, templateId || null, startTime, endTime, note, breakAllowed]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { rows: shiftRows } = await pool.query('SELECT * FROM schedules WHERE id=$1', [req.params.id])
    const shift = shiftRows[0]
    if (!shift) return res.status(404).json({ error: 'Shift not found' })

    if (!(await canManage(req.user.userId, req.user.role, shift.user_id))) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    await pool.query('DELETE FROM schedules WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
