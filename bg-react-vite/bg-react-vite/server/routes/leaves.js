import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.post('/', async (req, res) => {
  try {
    const uid = req.user.userId
    const { type, start, end, reason = '—', attachmentName = '', attachmentUrl = '' } = req.body
    if (!type || !start || !end) return res.status(400).json({ error: 'Type, start and end required' })
    const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
    if (days < 1) return res.status(400).json({ error: 'End date must be on or after start date' })

    // Enforce balance — prevent negative leave
    const { rows: balRows } = await pool.query(
      'SELECT total, used FROM leave_balances WHERE user_id=$1 AND leave_type=$2',
      [uid, type]
    )
    const bal = balRows[0]
    if (bal) {
      const remaining = bal.total - bal.used
      if (remaining <= 0) {
        return res.status(400).json({ error: `You have no remaining ${type} balance.` })
      }
      if (days > remaining) {
        return res.status(400).json({
          error: `Not enough balance. You requested ${days} day${days !== 1 ? 's' : ''} but only have ${remaining} remaining.`,
        })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO leaves (user_id, type, start_date, end_date, days, reason, attachment_name, attachment_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
      [uid, type, start, end, days, reason || '—', attachmentName, attachmentUrl]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const uid = req.user.userId
    const { rows } = await pool.query(
      'DELETE FROM leaves WHERE id=$1 AND user_id=$2 AND status=\'pending\' RETURNING id',
      [req.params.id, uid]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Leave not found or not pending' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const { rows: leaveRows } = await pool.query('SELECT * FROM leaves WHERE id = $1', [req.params.id])
    const leave = leaveRows[0]
    if (!leave) return res.status(404).json({ error: 'Leave not found' })

    // Permission check: admin can act on any, team lead only on subordinates
    if (req.user.role !== 'admin') {
      const { rows: subRows } = await pool.query(
        'SELECT id FROM users WHERE reports_to = $1 AND id = $2',
        [req.user.userId, leave.user_id]
      )
      if (!subRows[0]) return res.status(403).json({ error: 'Forbidden' })
    }

    await pool.query('BEGIN')
    const prevStatus = leave.status
    await pool.query('UPDATE leaves SET status=$1 WHERE id=$2', [status, leave.id])

    // Adjust leave balance
    const bal = await pool.query(
      'SELECT * FROM leave_balances WHERE user_id=$1 AND leave_type=$2',
      [leave.user_id, leave.type]
    )
    if (bal.rows[0]) {
      if (prevStatus !== 'approved' && status === 'approved') {
        await pool.query(
          'UPDATE leave_balances SET used = used + $1 WHERE user_id=$2 AND leave_type=$3',
          [leave.days, leave.user_id, leave.type]
        )
      } else if (prevStatus === 'approved' && status !== 'approved') {
        await pool.query(
          'UPDATE leave_balances SET used = GREATEST(0, used - $1) WHERE user_id=$2 AND leave_type=$3',
          [leave.days, leave.user_id, leave.type]
        )
      }
    }
    await pool.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
