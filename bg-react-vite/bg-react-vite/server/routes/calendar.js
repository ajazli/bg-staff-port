import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, date, color = '#AB47BC' } = req.body
    if (!title || !date) return res.status(400).json({ error: 'Title and date required' })
    const { rows } = await pool.query(
      'INSERT INTO calendar_events (title, date, color, created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, date, color, req.user.userId]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM calendar_events WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
