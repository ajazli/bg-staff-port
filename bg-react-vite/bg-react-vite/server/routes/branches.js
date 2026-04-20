import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, address = '', lat, lng, radius = 100, color = '#7986CB' } = req.body
    if (!name) return res.status(400).json({ error: 'Name required' })
    const { rows } = await pool.query(
      'INSERT INTO branches (name, address, lat, lng, radius, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, address, lat || null, lng || null, Number(radius) || 100, color]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, address, lat, lng, radius, color } = req.body
    const { rows } = await pool.query(
      'UPDATE branches SET name=$1, address=$2, lat=$3, lng=$4, radius=$5, color=$6 WHERE id=$7 RETURNING *',
      [name, address || '', lat || null, lng || null, Number(radius) || 100, color, req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Branch not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM branches')
    if (Number(rows[0].count) <= 1) return res.status(400).json({ error: 'Cannot delete the only branch' })
    await pool.query('DELETE FROM branches WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
