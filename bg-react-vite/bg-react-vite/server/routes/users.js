import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// Create user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, username, role, branchIds = [], reportsTo = null } = req.body
    if (!name || !username) return res.status(400).json({ error: 'Name and username required' })
    const id       = username.trim().toLowerCase().replace(/\s+/g, '')
    const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()

    await pool.query('BEGIN')
    const { rows } = await pool.query(
      `INSERT INTO users (id, name, initials, role, must_set_pw, branch_ids, reports_to, expected_start, expected_end, work_days)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,'[1,2,3,4,5]') RETURNING *`,
      [id, name, initials, role || 'staff', JSON.stringify(branchIds), reportsTo || null,
       role === 'admin' ? '' : '09:00', role === 'admin' ? '' : '18:00']
    )
    const LEAVE_TYPES = [
      ['Annual Leave',14],['Sick Leave',14],['Hospitalisation Leave',60],['Childcare Leave',6],
      ['Maternity Leave',112],['Paternity Leave',14],['NS Leave',0],['Compassionate Leave',3],
      ['Unpaid Leave',0],['PH Off-in-Lieu',0],
    ]
    for (const [lt, days] of LEAVE_TYPES) {
      await pool.query(
        'INSERT INTO leave_balances (user_id, leave_type, total, used) VALUES ($1,$2,$3,0)',
        [id, lt, days]
      )
    }
    await pool.query('COMMIT')
    res.status(201).json(rows[0])
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error(err)
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' })
    res.status(500).json({ error: 'Server error' })
  }
})

// Update user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    // Non-admin users can only update themselves
    if (req.user.role !== 'admin' && req.user.userId !== id) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const { name, role, branchIds, reportsTo, expectedStart, expectedEnd, workDays, memo } = req.body
    const initials = name ? name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() : undefined

    const sets = []
    const vals = []
    let n = 1
    const add = (col, val) => { sets.push(`${col} = $${n++}`); vals.push(val) }

    if (name          !== undefined) { add('name', name); add('initials', initials) }
    if (role          !== undefined) add('role', role)
    if (branchIds     !== undefined) add('branch_ids', JSON.stringify(branchIds))
    if (reportsTo     !== undefined) add('reports_to', reportsTo || null)
    if (expectedStart !== undefined) add('expected_start', expectedStart)
    if (expectedEnd   !== undefined) add('expected_end', expectedEnd)
    if (workDays      !== undefined) add('work_days', JSON.stringify(workDays))
    if (memo          !== undefined) add('memo', memo)

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
    vals.push(id)
    const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${n} RETURNING *`, vals)
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Reset password (admin only)
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }
    const hash = await bcrypt.hash(newPassword, 10)
    const { rows } = await pool.query(
      'UPDATE users SET password_hash = $1, must_set_pw = false WHERE id = $2 RETURNING id',
      [hash, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Update leave balance (admin only)
router.put('/:id/balance', requireAdmin, async (req, res) => {
  try {
    const { leaveType, field, value } = req.body
    if (field !== 'total' && field !== 'used') return res.status(400).json({ error: 'Field must be total or used' })
    const col = field === 'total' ? 'total' : 'used'
    await pool.query(
      `INSERT INTO leave_balances (user_id, leave_type, total, used) VALUES ($1,$2,$3,0)
       ON CONFLICT (user_id, leave_type) DO UPDATE SET ${col} = $4`,
      [req.params.id, leaveType, field === 'total' ? Math.max(0, Number(value)) : 0, Math.max(0, Number(value))]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
