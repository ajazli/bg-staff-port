import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, startTime, endTime, color = '#7986CB' } = req.body
    if (!name) return res.status(400).json({ error: 'Name required' })
    const { rows } = await pool.query(
      'INSERT INTO shift_templates (name, start_time, end_time, color) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, startTime, endTime, color]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, startTime, endTime, color } = req.body
    const { rows } = await pool.query(
      'UPDATE shift_templates SET name=$1, start_time=$2, end_time=$3, color=$4 WHERE id=$5 RETURNING *',
      [name, startTime, endTime, color, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Template not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM shift_templates WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
