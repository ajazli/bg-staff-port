import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb } from './init.js'
import authRoutes       from './routes/auth.js'
import usersRoutes      from './routes/users.js'
import branchesRoutes   from './routes/branches.js'
import attendanceRoutes from './routes/attendance.js'
import leavesRoutes     from './routes/leaves.js'
import templatesRoutes  from './routes/templates.js'
import schedulesRoutes  from './routes/schedules.js'
import calendarRoutes   from './routes/calendar.js'
import appDataRoutes    from './routes/appdata.js'
import breakagesRoutes  from './routes/breakages.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))  // large enough for base64 attachments

// ─── API routes ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }))
app.use('/api/auth',        authRoutes)
app.use('/api/users',       usersRoutes)
app.use('/api/branches',    branchesRoutes)
app.use('/api/attendance',  attendanceRoutes)
app.use('/api/leaves',      leavesRoutes)
app.use('/api/templates',   templatesRoutes)
app.use('/api/schedules',   schedulesRoutes)
app.use('/api/calendar',    calendarRoutes)
app.use('/api/app-data',    appDataRoutes)
app.use('/api/breakages',   breakagesRoutes)

// ─── Serve built React app in production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '../dist')
  app.use(express.static(distDir))
  app.get('*', (_, res) => res.sendFile(path.join(distDir, 'index.html')))
}

// ─── Start ───────────────────────────────────────────────────────────────────
initDb()
  .then(() => app.listen(PORT, () => console.log(`Server listening on port ${PORT}`)))
  .catch((err) => { console.error('Failed to start:', err); process.exit(1) })
