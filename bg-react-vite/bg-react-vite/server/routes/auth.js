import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username) return res.status(400).json({ error: 'Username required' })

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [username.trim().toLowerCase()])
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Incorrect username or password.' })

    if (user.must_set_pw) return res.json({ ok: true, setupRequired: true, userId: user.id })

    const valid = await bcrypt.compare(password || '', user.password_hash || '')
    if (!valid) return res.status(401).json({ error: 'Incorrect username or password.' })

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )
    res.json({ ok: true, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/setup-password', async (req, res) => {
  try {
    const { userId, password } = req.body
    if (!userId || !password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      'UPDATE users SET password_hash = $1, must_set_pw = false WHERE id = $2 RETURNING *',
      [hash, userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })

    const token = jwt.sign(
      { userId: rows[0].id, role: rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )
    res.json({ ok: true, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' })
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId])
    const user = rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })

    const valid = await bcrypt.compare(currentPassword, user.password_hash || '')
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })

    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, initials, role FROM users WHERE id = $1', [req.user.userId])
    if (!rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
