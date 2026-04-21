import { Router } from 'express'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// Submit a breakage report
router.post('/', async (req, res) => {
  try {
    const uid = req.user.userId
    const { date, time = '', reason, attachmentName = '', attachmentUrl = '' } = req.body
    if (!date || !reason?.trim()) {
      return res.status(400).json({ error: 'Date and reason are required' })
    }
    const { rows } = await pool.query(
      `INSERT INTO breakages (user_id, date, time, reason, attachment_name, attachment_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uid, date, time, reason.trim(), attachmentName, attachmentUrl]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
