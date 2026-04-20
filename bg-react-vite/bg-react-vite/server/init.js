import bcrypt from 'bcryptjs'
import { pool } from './db.js'

const LEAVE_TYPES = [
  { id: 'Annual Leave',          defaultDays: 14 },
  { id: 'Sick Leave',            defaultDays: 14 },
  { id: 'Hospitalisation Leave', defaultDays: 60 },
  { id: 'Childcare Leave',       defaultDays: 6  },
  { id: 'Maternity Leave',       defaultDays: 112 },
  { id: 'Paternity Leave',       defaultDays: 14 },
  { id: 'NS Leave',              defaultDays: 0  },
  { id: 'Compassionate Leave',   defaultDays: 3  },
  { id: 'Unpaid Leave',          defaultDays: 0  },
  { id: 'PH Off-in-Lieu',        defaultDays: 0  },
]

async function createTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id      VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
      name    VARCHAR(100) NOT NULL,
      address TEXT         DEFAULT '',
      lat     NUMERIC(10,7),
      lng     NUMERIC(10,7),
      radius  INTEGER      DEFAULT 100,
      color   VARCHAR(10)  DEFAULT '#7986CB',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id             VARCHAR(50) PRIMARY KEY,
      name           VARCHAR(100) NOT NULL,
      initials       VARCHAR(5)   NOT NULL,
      role           VARCHAR(20)  NOT NULL DEFAULT 'staff',
      password_hash  VARCHAR(100),
      must_set_pw    BOOLEAN      DEFAULT TRUE,
      branch_ids     JSONB        DEFAULT '[]',
      reports_to     VARCHAR(50)  REFERENCES users(id) ON DELETE SET NULL,
      expected_start VARCHAR(5)   DEFAULT '09:00',
      expected_end   VARCHAR(5)   DEFAULT '18:00',
      work_days      JSONB        DEFAULT '[1,2,3,4,5]',
      memo           TEXT         DEFAULT '',
      created_at     TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shift_templates (
      id         VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
      name       VARCHAR(100) NOT NULL,
      start_time VARCHAR(5)   NOT NULL,
      end_time   VARCHAR(5)   NOT NULL,
      color      VARCHAR(10)  DEFAULT '#7986CB',
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id          VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date        DATE        NOT NULL,
      branch_id   VARCHAR(50) REFERENCES branches(id) ON DELETE SET NULL,
      template_id VARCHAR(50) REFERENCES shift_templates(id) ON DELETE SET NULL,
      start_time  VARCHAR(5),
      end_time    VARCHAR(5),
      note        TEXT        DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id                   SERIAL      PRIMARY KEY,
      user_id              VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date                 DATE        NOT NULL,
      in_time              VARCHAR(5),
      out_time             VARCHAR(5),
      hours                VARCHAR(20),
      status               VARCHAR(20) DEFAULT 'complete',
      branch_id            VARCHAR(50) REFERENCES branches(id) ON DELETE SET NULL,
      branch_name          VARCHAR(100),
      loc_ok               BOOLEAN     DEFAULT FALSE,
      late_minutes         INTEGER     DEFAULT 0,
      is_late              BOOLEAN     DEFAULT FALSE,
      early_leave_minutes  INTEGER     DEFAULT 0,
      left_early           BOOLEAN     DEFAULT FALSE,
      overtime_minutes     INTEGER     DEFAULT 0,
      did_overtime         BOOLEAN     DEFAULT FALSE,
      expected_start       VARCHAR(5)  DEFAULT '',
      expected_end         VARCHAR(5)  DEFAULT '',
      ph_name              VARCHAR(100) DEFAULT '',
      ph_credit_added      BOOLEAN     DEFAULT FALSE,
      ph_credit_skipped    BOOLEAN     DEFAULT FALSE,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS active_sessions (
      user_id     VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      started_at  TIMESTAMPTZ NOT NULL,
      branch_id   VARCHAR(50) REFERENCES branches(id) ON DELETE SET NULL,
      branch_name VARCHAR(100),
      loc_ok      BOOLEAN     DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id              SERIAL      PRIMARY KEY,
      user_id         VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type            VARCHAR(50) NOT NULL,
      start_date      DATE        NOT NULL,
      end_date        DATE        NOT NULL,
      days            INTEGER     NOT NULL,
      reason          TEXT        DEFAULT '—',
      attachment_name VARCHAR(255) DEFAULT '',
      attachment_url  TEXT        DEFAULT '',
      status          VARCHAR(20) DEFAULT 'pending',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leave_balances (
      user_id    VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      leave_type VARCHAR(50) NOT NULL,
      total      INTEGER     NOT NULL DEFAULT 0,
      used       INTEGER     NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, leave_type)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id         VARCHAR(50) PRIMARY KEY DEFAULT gen_random_uuid(),
      title      VARCHAR(200) NOT NULL,
      date       DATE         NOT NULL,
      color      VARCHAR(10)  DEFAULT '#AB47BC',
      created_by VARCHAR(50)  REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_user  ON attendance(user_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date  ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_leaves_user      ON leaves(user_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_user   ON schedules(user_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_date   ON schedules(date);
  `)
}

async function seedData(client) {
  const { rows } = await client.query('SELECT COUNT(*) FROM users')
  if (Number(rows[0].count) > 0) return  // already seeded

  console.log('Seeding initial data…')

  const adminHash = await bcrypt.hash('admin123', 10)
  const aliceHash = await bcrypt.hash('pass123', 10)
  const carolHash = await bcrypt.hash('carol123', 10)

  // Branches
  await client.query(`
    INSERT INTO branches (id, name, address, lat, lng, radius, color) VALUES
      ('b1', 'East Coast', '380 E Coast Rd, Singapore 428986', 1.30215, 103.90879, 100, '#5b7fb8'),
      ('b2', 'Kilat',      '19 Lor Kilat, #01-02, Singapore 598120', 1.33968, 103.77606, 100, '#43a047')
  `)

  // Users — admin first (no reports_to), then alice, then others
  await client.query(`
    INSERT INTO users (id, name, initials, role, password_hash, must_set_pw, branch_ids, reports_to, expected_start, expected_end, work_days) VALUES
      ('admin', 'Admin',     'AD', 'admin',     $1, false, '[]',           null,    '', '',       '[1,2,3,4,5]'),
      ('alice', 'Alice Tan', 'AT', 'team_lead', $2, false, '["b1","b2"]', 'admin', '09:00', '18:00', '[1,2,3,4,5]'),
      ('bob',   'Bob Lim',   'BL', 'staff',     null, true,'["b2"]',      'alice', '09:00', '18:00', '[1,2,3,4,5]'),
      ('carol', 'Carol Ng',  'CN', 'staff',      $3, false,'["b1"]',      'alice', '09:00', '18:00', '[1,2,3,4,5]')
  `, [adminHash, aliceHash, carolHash])

  // Leave balances for all users
  const users   = ['admin', 'alice', 'bob', 'carol']
  const balVals = []
  const balArgs = []
  let i = 1
  users.forEach((uid) => {
    LEAVE_TYPES.forEach((lt) => {
      const used = uid === 'alice' && lt.id === 'Annual Leave' ? 3 : 0
      balVals.push(`($${i++}, $${i++}, $${i++}, $${i++})`)
      balArgs.push(uid, lt.id, lt.defaultDays, used)
    })
  })
  await client.query(
    `INSERT INTO leave_balances (user_id, leave_type, total, used) VALUES ${balVals.join(', ')}`,
    balArgs
  )

  // Shift templates
  await client.query(`
    INSERT INTO shift_templates (id, name, start_time, end_time, color) VALUES
      ('st1', 'Morning',   '07:00', '15:00', '#FFB74D'),
      ('st2', 'Afternoon', '12:00', '20:00', '#4DB6AC'),
      ('st3', 'Full Day',  '09:00', '18:00', '#7986CB')
  `)

  // Sample attendance for alice
  await client.query(`
    INSERT INTO attendance (user_id, date, in_time, out_time, hours, status, branch_id, branch_name, loc_ok, expected_start, expected_end, late_minutes, is_late) VALUES
      ('alice', '2026-04-18', '09:02', '18:05', '9h 3m', 'complete', 'b1', 'East Coast', true, '09:00', '18:00', 2, true),
      ('alice', '2026-04-17', '08:55', '18:00', '9h 5m', 'complete', 'b2', 'Kilat',      true, '09:00', '18:00', 0, false)
  `)

  // Sample leave for alice (approved)
  await client.query(`
    INSERT INTO leaves (user_id, type, start_date, end_date, days, reason, status) VALUES
      ('alice', 'Annual Leave', '2026-05-01', '2026-05-03', 3, 'Family trip', 'approved')
  `)

  // Sample schedules for alice
  await client.query(`
    INSERT INTO schedules (id, user_id, date, branch_id, template_id, start_time, end_time) VALUES
      ('sch1', 'alice', '2026-04-21', 'b1', 'st3', '09:00', '18:00'),
      ('sch2', 'alice', '2026-04-22', 'b2', 'st1', '07:00', '15:00')
  `)

  // Sample calendar event
  await client.query(`
    INSERT INTO calendar_events (id, title, date, color, created_by) VALUES
      ('evt1', 'Team Meeting', '2026-04-22', '#AB47BC', 'admin')
  `)

  console.log('Seed complete.')
}

export async function initDb() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await createTables(client)
    await seedData(client)
    await client.query('COMMIT')
    console.log('Database initialised.')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Database init failed:', err)
    throw err
  } finally {
    client.release()
  }
}
