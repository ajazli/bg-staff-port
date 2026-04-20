import jwt from 'jsonwebtoken'

export function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' })
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
  next()
}

export function requireAdminOrTeamLead(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'team_lead') {
    return res.status(403).json({ error: 'Insufficient permissions' })
  }
  next()
}
