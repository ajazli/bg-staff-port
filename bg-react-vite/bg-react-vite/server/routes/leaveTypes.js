import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leave_types ORDER BY sort_order, name')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, color = '#43a047', defaultDays = 0, requiresFile = false } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
    const id = name.trim()
    const { rows: ord } = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM leave_types')
    const { rows } = await pool.query(
      `INSERT INTO leave_types (id, name, color, default_days, requires_file, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, id, color, Number(defaultDays), requiresFile, ord[0].next]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A leave type with that name already exists' })
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { color, defaultDays, requiresFile } = req.body
    const sets = []; const vals = []; let n = 1
    const add = (col, v) => { sets.push(`${col}=$${n++}`); vals.push(v) }
    if (color        !== undefined) add('color', color)
    if (defaultDays  !== undefined) add('default_days', Number(defaultDays))
    if (requiresFile !== undefined) add('requires_file', requiresFile)
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
    vals.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE leave_types SET ${sets.join(',')} WHERE id=$${n} RETURNING *`, vals
    )
    if (!rows[0]) return res.status(404).json({ error: 'Leave type not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows: used } = await pool.query('SELECT COUNT(*) FROM leaves WHERE type=$1', [req.params.id])
    if (Number(used[0].count) > 0) {
      return res.status(409).json({ error: 'Cannot delete: leave records exist for this type' })
    }
    await pool.query('DELETE FROM leave_types WHERE id=$1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
