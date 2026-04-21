import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localDateToStr } from '../utils'
import AppShell from './AppShell'
import Badge from './Badge'
import CalendarView from './CalendarView'
import Modal from './Modal'

// ─── Leave Requests ──────────────────────────────────────────────────────────
function LeavesPanel({ db, helpers, actLeave, currentUserId }) {
  const [filter, setFilter] = useState('pending')
  const allLeaves = useMemo(() =>
    Object.entries(db.leaves).flatMap(([uid, records]) =>
      records.map((rec) => ({ ...rec, uid }))
    ), [db.leaves])

  const visible = filter === 'all' ? allLeaves : allLeaves.filter((r) => r.status === filter)

  return (
    <div>
      <div className="filter-row">
        {['pending','approved','rejected','all'].map((f) => (
          <button key={f} className={`subnav-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="table-card">
        <table>
          <thead><tr><th>Staff</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Doc</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {visible.length === 0
              ? <tr><td colSpan="9" className="empty-cell">No records</td></tr>
              : visible.map((rec) => {
                  const lt = helpers.getLeaveType(rec.type)
                  return (
                    <tr key={`${rec.uid}-${rec.idx}`}>
                      <td>{db.users[rec.uid]?.name}</td>
                      <td><span style={{ color: lt?.color }}>{rec.type}</span></td>
                      <td>{helpers.fmtDate(rec.start)}</td>
                      <td>{helpers.fmtDate(rec.end)}</td>
                      <td>{rec.days}</td>
                      <td className="td-reason">{rec.reason}</td>
                      <td>
                        {rec.attachmentUrl
                          ? <a href={rec.attachmentUrl} download={rec.attachmentName} className="link-btn">{rec.attachmentName}</a>
                          : '—'}
                      </td>
                      <td><Badge tone={rec.status === 'approved' ? 'success' : rec.status === 'rejected' ? 'danger' : 'info'}>{helpers.cap(rec.status)}</Badge></td>
                      <td>
                        {rec.status === 'pending'
                          ? <div className="stack-inline">
                              <button className="ghost-btn" onClick={() => actLeave(rec.uid, rec.id, 'approved')}>Approve</button>
                              <button className="ghost-btn danger-text" onClick={() => actLeave(rec.uid, rec.id, 'rejected')}>Reject</button>
                            </div>
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Live Attendance ─────────────────────────────────────────────────────────
function AttendancePanel({ db, helpers }) {
  const today = localDateToStr(new Date())
  const [tab, setTab] = useState('live')

  const activeSessions = Object.entries(db.activeSessions || {}).map(([uid, session]) => {
    const user       = db.users[uid]
    const todayShift = helpers.getTodayShift(uid)
    const expStart   = todayShift?.startTime || user?.expectedStart || ''
    let lateMin = 0
    if (expStart && session.startedAt) {
      const clockedAt = new Date(session.startedAt)
      const [h, m]    = expStart.split(':').map(Number)
      const expected  = new Date(clockedAt)
      expected.setHours(h, m, 0, 0)
      lateMin = Math.max(0, Math.round((clockedAt - expected) / 60000))
    }
    return { uid, user, session, expStart, lateMin, branch: helpers.getBranch(session.branchId) }
  })

  const allAttendance = useMemo(() =>
    Object.entries(db.attendance).flatMap(([uid, records]) =>
      records.map((rec, idx) => ({ ...rec, uid, idx }))
    ), [db.attendance])

  const todayAttendance = allAttendance.filter((r) => r.date === today)

  return (
    <div>
      <div className="filter-row">
        <button className={`subnav-btn${tab === 'live' ? ' active' : ''}`} onClick={() => setTab('live')}>Live ({activeSessions.length})</button>
        <button className={`subnav-btn${tab === 'today' ? ' active' : ''}`} onClick={() => setTab('today')}>Today's records</button>
        <button className={`subnav-btn${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All history</button>
      </div>

      {tab === 'live' && (
        <div className="table-card">
          <table>
            <thead><tr><th>Staff</th><th>Branch</th><th>Clocked in at</th><th>Expected start</th><th>Late by</th><th>Location</th></tr></thead>
            <tbody>
              {activeSessions.length === 0
                ? <tr><td colSpan="6" className="empty-cell">No one is currently clocked in</td></tr>
                : activeSessions.map(({ uid, user, session, expStart, lateMin, branch }) => (
                  <tr key={uid}>
                    <td>{user?.name}</td>
                    <td>{branch?.name || session.branchName}</td>
                    <td>{new Date(session.startedAt).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                    <td>{expStart || '—'}</td>
                    <td>{lateMin > 0 ? <Badge tone="warn">{lateMin}m late</Badge> : <Badge tone="success">On time</Badge>}</td>
                    <td><Badge tone={session.locOk ? 'success' : 'danger'}>{session.locOk ? 'On-site' : 'Flagged'}</Badge></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {(tab === 'today' || tab === 'all') && (
        <div className="table-card">
          <table>
            <thead><tr><th>Staff</th><th>Date</th><th>Expected</th><th>In</th><th>Out</th><th>Hours</th><th>Branch</th><th>Location</th><th>Timing</th></tr></thead>
            <tbody>
              {(tab === 'today' ? todayAttendance : allAttendance).length === 0
                ? <tr><td colSpan="9" className="empty-cell">No records</td></tr>
                : (tab === 'today' ? todayAttendance : allAttendance).map((rec) => (
                  <tr key={`${rec.uid}-${rec.idx}`}>
                    <td>{db.users[rec.uid]?.name}</td>
                    <td>{helpers.fmtDate(rec.date)}</td>
                    <td>{rec.expectedStart || '—'} / {rec.expectedEnd || '—'}</td>
                    <td>{rec.in}</td>
                    <td>{rec.out || '—'}</td>
                    <td>{rec.hours || '—'}</td>
                    <td>{rec.branchName}</td>
                    <td><Badge tone={rec.locOk ? 'success' : 'danger'}>{rec.locOk ? 'On-site' : 'Flagged'}</Badge></td>
                    <td><div className="stack-inline">{helpers.getTimingBadges(rec).map((t) => <Badge key={t} tone={t.includes('Late') || t.includes('early') ? 'warn' : 'info'}>{t}</Badge>)}</div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Breakages (admin) ───────────────────────────────────────────────────────
function BreakagesPanel({ db, helpers }) {
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(null)  // url string

  const allBreakages = Object.entries(db.breakages || {}).flatMap(([uid, records]) =>
    records.map((r) => ({ ...r, uid }))
  ).sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date)
    return new Date(b.createdAt) - new Date(a.createdAt)
  })

  const filtered = search.trim()
    ? allBreakages.filter((b) =>
        (db.users[b.uid]?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        b.reason.toLowerCase().includes(search.toLowerCase())
      )
    : allBreakages

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Breakage reports</div>
        <input
          className="search-input"
          placeholder="Search staff or reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Desktop table */}
      <div className="table-card leave-table-desktop">
        <table>
          <thead>
            <tr><th>Staff</th><th>Date</th><th>Time</th><th>Reason</th><th>Photo</th><th>Submitted</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan="6" className="empty-cell">No breakage reports</td></tr>
              : filtered.map((b) => (
                <tr key={b.id}>
                  <td><strong>{db.users[b.uid]?.name || b.uid}</strong></td>
                  <td>{helpers.fmtDate(b.date)}</td>
                  <td>{b.time || '—'}</td>
                  <td className="td-reason">{b.reason}</td>
                  <td>
                    {b.attachmentUrl
                      ? (
                        <button className="ghost-btn breakage-thumb-btn" onClick={() => setPreview(b.attachmentUrl)}>
                          <img src={b.attachmentUrl} alt="breakage" className="breakage-thumb-sm" />
                        </button>
                      )
                      : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>
                    {b.createdAt ? new Date(b.createdAt).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="leave-cards-mobile">
        {filtered.length === 0
          ? <div className="table-card"><div className="empty-cell">No breakage reports</div></div>
          : filtered.map((b) => (
            <div key={b.id} className="breakage-card">
              <div className="breakage-card-header">
                <strong>{db.users[b.uid]?.name || b.uid}</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{helpers.fmtDate(b.date)}{b.time ? ` · ${b.time}` : ''}</span>
              </div>
              <div className="breakage-card-reason">{b.reason}</div>
              {b.attachmentUrl && (
                <button className="ghost-btn breakage-thumb-btn" onClick={() => setPreview(b.attachmentUrl)} style={{ marginTop: 8 }}>
                  <img src={b.attachmentUrl} alt="breakage" className="breakage-thumb-sm" />
                </button>
              )}
            </div>
          ))}
      </div>

      {/* Full-size image preview modal */}
      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="breakage-fullimg-wrap" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close breakage-fullimg-close" onClick={() => setPreview(null)}>✕</button>
            <img src={preview} alt="breakage" className="breakage-fullimg" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Staff Profile View ───────────────────────────────────────────────────────
const MAX_AVATAR_ADMIN = 5 * 1024 * 1024

function StaffProfileView({ uid, db, helpers, leaveTypes, saveStaff, resetPassword, deleteUser, setBalance, onBack }) {
  const u = db.users[uid]
  const [memo, setMemo]           = useState(u?.memo || '')
  const [memoSaved, setMemoSaved] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetForm, setResetForm] = useState({ next: '', confirm: '' })
  const [resetError, setResetError]     = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  const [editAvatar, setEditAvatar]   = useState(u?.avatarUrl || '')
  const [editBirthday, setEditBirthday] = useState(u?.birthday || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const avatarFileRef = useRef()

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_AVATAR_ADMIN) { alert('Image must be under 5 MB.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setEditAvatar(ev.target.result)
    reader.readAsDataURL(file)
  }

  const saveProfileData = async () => {
    setProfileSaving(true)
    try {
      await saveStaff(uid, { avatarUrl: editAvatar || null, birthday: editBirthday || null })
      setProfileSuccess('Saved!')
      setTimeout(() => setProfileSuccess(''), 2500)
    } finally {
      setProfileSaving(false)
    }
  }

  const saveMemo = async () => {
    await saveStaff(uid, { memo })
    setMemoSaved(true)
    setTimeout(() => setMemoSaved(false), 2500)
  }

  const handleReset = async () => {
    setResetError(''); setResetSuccess('')
    if (resetForm.next.length < 6) return setResetError('Password must be at least 6 characters.')
    if (resetForm.next !== resetForm.confirm) return setResetError('Passwords do not match.')
    try {
      await resetPassword(uid, resetForm.next)
      setResetSuccess('Password reset successfully.')
      setResetForm({ next: '', confirm: '' })
    } catch (err) { setResetError(err.message || 'Failed.') }
  }

  const DAY_NAMES = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' }
  const workDayStr = (u?.workDays || [])
    .slice().sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => DAY_NAMES[d]).join(', ')

  const attendance = (db.attendance[uid] || []).slice(0, 15)
  const leaves     = (db.leaves[uid]     || []).slice(0, 15)
  const breakages  = (db.breakages?.[uid] || []).slice(0, 15)

  if (!u) return null

  return (
    <div>
      <div className="profile-header">
        <button className="ghost-btn profile-back-btn" onClick={onBack}>← Back</button>
        {editAvatar
          ? <img src={editAvatar} alt={u.initials} className="avatar-lg" />
          : <div className="avatar-lg-initials">{u.initials}</div>}
        <div>
          <span className="profile-name">{u.name}</span>
          <Badge tone={u.role === 'team_lead' ? 'info' : 'default'}>{helpers.cap(u.role)}</Badge>
        </div>
      </div>

      <div className="profile-grid-top">
        {/* Details */}
        <div className="panel">
          <div className="section-title">Details</div>
          {[
            ['Username',   uid],
            ['Branches',   helpers.getUserBranches(uid).map((b) => b.name).join(', ') || '—'],
            ['Hours',      `${u.expectedStart || '—'} – ${u.expectedEnd || '—'}`],
            ['Work days',  workDayStr || '—'],
            ['Reports to', u.reportsTo ? (db.users[u.reportsTo]?.name || u.reportsTo) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="detail-row">
              <span className="detail-label">{label}</span>
              <strong className="detail-value">{value}</strong>
            </div>
          ))}

          {/* Avatar + birthday edit */}
          <div style={{ marginTop: 14 }}>
            <div className="avatar-upload-row" style={{ marginBottom: 10 }}>
              {editAvatar
                ? <img src={editAvatar} alt="avatar" className="avatar-lg" />
                : <div className="avatar-lg-initials">{u.initials}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="ghost-btn" style={{ padding: '5px 10px', fontSize: 13 }}
                  onClick={() => avatarFileRef.current?.click()}>
                  {editAvatar ? 'Change photo' : 'Upload photo'}
                </button>
                {editAvatar && (
                  <button className="ghost-btn danger-text" style={{ padding: '5px 10px', fontSize: 13 }}
                    onClick={() => { setEditAvatar(''); if (avatarFileRef.current) avatarFileRef.current.value = '' }}>
                    Remove photo
                  </button>
                )}
                <input ref={avatarFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
              </div>
            </div>
            <label className="field">
              <span>Birthday</span>
              <input type="date" value={editBirthday} onChange={(e) => setEditBirthday(e.target.value)} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="primary-btn" style={{ padding: '8px 14px', fontSize: 13 }}
                onClick={saveProfileData} disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save photo & birthday'}
              </button>
              {profileSuccess && <span style={{ color: '#2e7d32', fontSize: 13, fontWeight: 600 }}>{profileSuccess}</span>}
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="ghost-btn" onClick={() => setShowReset((r) => !r)}>
              {showReset ? 'Cancel' : 'Reset password'}
            </button>
            {showReset && (
              <div>
                <label className="field"><span>New password</span>
                  <input type="password" value={resetForm.next} onChange={(e) => setResetForm({ ...resetForm, next: e.target.value })} />
                </label>
                <label className="field"><span>Confirm</span>
                  <input type="password" value={resetForm.confirm} onChange={(e) => setResetForm({ ...resetForm, confirm: e.target.value })} />
                </label>
                {resetError   && <div className="error-box">{resetError}</div>}
                {resetSuccess && <div className="success-box">{resetSuccess}</div>}
                <button className="primary-btn" onClick={handleReset}>Reset password</button>
              </div>
            )}
            <button className="ghost-btn danger-text"
              onClick={() => { if (confirm(`Delete ${u.name}? This cannot be undone.`)) { deleteUser(uid); onBack() } }}>
              Delete staff member
            </button>
          </div>
        </div>

        {/* Memo */}
        <div className="panel">
          <div className="section-title">Memo</div>
          <textarea className="memo-textarea" value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Notes about this staff member…" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button className="primary-btn" onClick={saveMemo}>Save memo</button>
            {memoSaved && <span style={{ color: '#2e7d32', fontSize: 13, fontWeight: 600 }}>Saved!</span>}
          </div>
        </div>
      </div>

      {/* Leave balances */}
      <div className="section-title" style={{ marginTop: 4 }}>Leave balances</div>
      <div className="balance-grid" style={{ marginBottom: 24 }}>
        {(leaveTypes || []).map((lt) => {
          const bal = db.balances[uid]?.[lt.id] || { total: 0, used: 0 }
          return (
            <div key={lt.id} className="balance-card" style={{ borderTop: `3px solid ${lt.color}` }}>
              <div className="balance-title" style={{ color: lt.color }}>{lt.label || lt.name}</div>
              <div className="balance-value" style={{ color: lt.color }}>{bal.total - bal.used}</div>
              <div className="balance-sub">{bal.used} used of {bal.total}</div>
            </div>
          )
        })}
      </div>

      {/* Recent attendance */}
      <div className="section-title">Recent attendance</div>
      <div className="table-card" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Branch</th><th>Timing</th></tr></thead>
          <tbody>
            {attendance.length === 0
              ? <tr><td colSpan="6" className="empty-cell">No attendance records</td></tr>
              : attendance.map((rec) => (
                <tr key={rec.id || rec.date}>
                  <td>{helpers.fmtDate(rec.date)}</td>
                  <td>{rec.in}</td>
                  <td>{rec.out || '—'}</td>
                  <td>{rec.hours || '—'}</td>
                  <td>{rec.branchName}</td>
                  <td>
                    <div className="stack-inline">
                      {helpers.getTimingBadges(rec).map((t) => (
                        <Badge key={t} tone={t.includes('Late') || t.includes('early') ? 'warn' : 'success'}>{t}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Leave history */}
      <div className="section-title">Leave history</div>
      <div className="table-card" style={{ marginBottom: 20 }}>
        <table>
          <thead><tr><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            {leaves.length === 0
              ? <tr><td colSpan="6" className="empty-cell">No leave records</td></tr>
              : leaves.map((rec) => {
                  const lt = helpers.getLeaveType(rec.type)
                  return (
                    <tr key={rec.id}>
                      <td><span style={{ color: lt?.color }}>{rec.type}</span></td>
                      <td>{helpers.fmtDate(rec.start)}</td>
                      <td>{helpers.fmtDate(rec.end)}</td>
                      <td>{rec.days}</td>
                      <td className="td-reason">{rec.reason}</td>
                      <td>
                        <Badge tone={rec.status === 'approved' ? 'success' : rec.status === 'rejected' ? 'danger' : 'info'}>
                          {helpers.cap(rec.status)}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>

      {/* Breakage history */}
      <div className="section-title">Breakage history</div>
      <div className="table-card">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Reason</th><th>Photo</th></tr></thead>
          <tbody>
            {breakages.length === 0
              ? <tr><td colSpan="4" className="empty-cell">No breakage records</td></tr>
              : breakages.map((b) => (
                <tr key={b.id}>
                  <td>{helpers.fmtDate(b.date)}</td>
                  <td>{b.time || '—'}</td>
                  <td className="td-reason">{b.reason}</td>
                  <td>
                    {b.attachmentUrl
                      ? <a href={b.attachmentUrl} target="_blank" rel="noopener noreferrer" className="link-btn">View photo</a>
                      : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Staff CRUD ──────────────────────────────────────────────────────────────
function StaffPanel({ db, helpers, leaveTypes, addUser, saveStaff, deleteUser, setBalance, resetPassword }) {
  const [profileUid, setProfileUid] = useState(null)
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm]   = useState({ name: '', username: '', role: 'staff', branchIds: [], reportsTo: '' })
  const [rowEdits, setRowEdits]       = useState({})
  const [saving, setSaving]           = useState({})

  const DAY_OPTIONS = [
    { value: 1, label: 'M' }, { value: 2, label: 'Tu' }, { value: 3, label: 'W' },
    { value: 4, label: 'Th' }, { value: 5, label: 'F' }, { value: 6, label: 'Sa' }, { value: 0, label: 'Su' },
  ]

  function initEdit(uid) {
    const u   = db.users[uid]
    const bal = db.balances[uid] || {}
    return {
      name:          u.name || '',
      role:          u.role || 'staff',
      branchIds:     [...(u.branchIds || [])],
      expectedStart: u.expectedStart || '',
      expectedEnd:   u.expectedEnd   || '',
      workDays:      [...(u.workDays || [1, 2, 3, 4, 5])],
      annual:  Number(bal['Annual Leave']?.total   ?? 14),
      medical: Number(bal['Sick Leave']?.total     ?? 14),
      phoil:   Number(bal['PH Off-in-Lieu']?.total ?? 0),
      er:      Number(bal['NS Leave']?.total       ?? 0),
    }
  }

  const getEdit = (uid) => rowEdits[uid] ?? initEdit(uid)

  const setField = (uid, field, value) =>
    setRowEdits((prev) => ({ ...prev, [uid]: { ...getEdit(uid), [field]: value } }))

  const toggleDay = (uid, day) => {
    const days = getEdit(uid).workDays
    setField(uid, 'workDays', days.includes(day) ? days.filter((d) => d !== day) : [...days, day])
  }

  const toggleBranch = (uid, bid) => {
    const ids = getEdit(uid).branchIds
    setField(uid, 'branchIds', ids.includes(bid) ? ids.filter((i) => i !== bid) : [...ids, bid])
  }

  const handleSave = async (uid) => {
    const edit = rowEdits[uid]
    if (!edit) return
    setSaving((prev) => ({ ...prev, [uid]: true }))
    try {
      await saveStaff(uid, {
        name: edit.name, role: edit.role, branchIds: edit.branchIds,
        expectedStart: edit.expectedStart, expectedEnd: edit.expectedEnd,
        workDays: edit.workDays,
      })
      await Promise.all([
        setBalance(uid, 'Annual Leave',   'total', edit.annual),
        setBalance(uid, 'Sick Leave',     'total', edit.medical),
        setBalance(uid, 'PH Off-in-Lieu', 'total', edit.phoil),
        setBalance(uid, 'NS Leave',       'total', edit.er),
      ])
      setRowEdits((prev) => { const n = { ...prev }; delete n[uid]; return n })
    } finally {
      setSaving((prev) => { const n = { ...prev }; delete n[uid]; return n })
    }
  }

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.username.trim()) return
    await addUser({ ...createForm, reportsTo: createForm.reportsTo || null })
    setCreateModal(false)
    setCreateForm({ name: '', username: '', role: 'staff', branchIds: [], reportsTo: '' })
  }

  const toggleCreateBranch = (bid) =>
    setCreateForm((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(bid) ? prev.branchIds.filter((i) => i !== bid) : [...prev.branchIds, bid],
    }))

  const nonAdminUsers = Object.entries(db.users).filter(([, u]) => u.role !== 'admin')

  if (profileUid && db.users[profileUid]) {
    return (
      <StaffProfileView
        uid={profileUid} db={db} helpers={helpers} leaveTypes={leaveTypes}
        saveStaff={saveStaff} resetPassword={resetPassword}
        deleteUser={deleteUser} setBalance={setBalance}
        onBack={() => setProfileUid(null)}
      />
    )
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Team members</div>
        <button className="primary-btn" onClick={() => setCreateModal(true)}>+ Add staff</button>
      </div>

      <div className="table-card">
        <table className="staff-inline-table">
          <thead>
            <tr>
              <th>Name</th><th>Username</th><th>Role</th><th>Branches</th>
              <th>Start</th><th>End</th><th>Work days</th>
              <th title="Annual Leave">Annual</th>
              <th title="Sick Leave (MC)">Medical</th>
              <th title="PH Off-in-Lieu">PH OIL</th>
              <th title="NS Leave (Emergency Reservist)">ER</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {nonAdminUsers.map(([uid]) => {
              const edit  = getEdit(uid)
              const dirty = !!rowEdits[uid]
              return (
                <tr key={uid} className={dirty ? 'row-dirty' : ''}>
                  <td>
                    <input className="si-input" value={edit.name}
                      onChange={(e) => setField(uid, 'name', e.target.value)} />
                  </td>
                  <td className="uid-cell">{uid}</td>
                  <td>
                    <select className="si-select" value={edit.role}
                      onChange={(e) => setField(uid, 'role', e.target.value)}>
                      <option value="staff">Staff</option>
                      <option value="team_lead">Team Lead</option>
                    </select>
                  </td>
                  <td>
                    <div className="si-chips">
                      {db.branches.map((b) => (
                        <button key={b.id} type="button"
                          className={`day-toggle${edit.branchIds.includes(b.id) ? ' active' : ''}`}
                          style={edit.branchIds.includes(b.id)
                            ? { background: b.color + '22', color: b.color, borderColor: b.color }
                            : {}}
                          onClick={() => toggleBranch(uid, b.id)}>
                          {b.name.length > 7 ? b.name.slice(0, 6) + '…' : b.name}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td><input type="time" className="si-time" value={edit.expectedStart} onChange={(e) => setField(uid, 'expectedStart', e.target.value)} /></td>
                  <td><input type="time" className="si-time" value={edit.expectedEnd}   onChange={(e) => setField(uid, 'expectedEnd',   e.target.value)} /></td>
                  <td>
                    <div className="si-chips">
                      {DAY_OPTIONS.map((d) => (
                        <button key={d.value} type="button"
                          className={`day-toggle${edit.workDays.includes(d.value) ? ' active' : ''}`}
                          onClick={() => toggleDay(uid, d.value)}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td><input type="number" className="si-num" min={0} value={edit.annual}  onChange={(e) => setField(uid, 'annual',  Number(e.target.value))} /></td>
                  <td><input type="number" className="si-num" min={0} value={edit.medical} onChange={(e) => setField(uid, 'medical', Number(e.target.value))} /></td>
                  <td><input type="number" className="si-num" min={0} value={edit.phoil}   onChange={(e) => setField(uid, 'phoil',   Number(e.target.value))} /></td>
                  <td><input type="number" className="si-num" min={0} value={edit.er}      onChange={(e) => setField(uid, 'er',      Number(e.target.value))} /></td>
                  <td>
                    <div className="stack-inline">
                      <button className="ghost-btn si-view-btn" onClick={() => setProfileUid(uid)}>View</button>
                      {dirty && (
                        <button className="primary-btn si-save-btn" onClick={() => handleSave(uid)} disabled={saving[uid]}>
                          {saving[uid] ? '…' : 'Save'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {createModal && (
        <Modal title="Add new team member" onClose={() => setCreateModal(false)}>
          <label className="field"><span>Full name</span>
            <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
          </label>
          <label className="field"><span>Username</span>
            <input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} />
          </label>
          <label className="field"><span>Role</span>
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="team_lead">Team Lead</option>
            </select>
          </label>
          <label className="field"><span>Reports to</span>
            <select value={createForm.reportsTo} onChange={(e) => setCreateForm({ ...createForm, reportsTo: e.target.value })}>
              <option value="">— None —</option>
              {Object.entries(db.users).filter(([, u]) => u.role !== 'staff').map(([id, u]) => (
                <option key={id} value={id}>{u.name} ({helpers.cap(u.role)})</option>
              ))}
            </select>
          </label>
          <div className="field"><span>Branches</span>
            <div className="check-grid">
              {db.branches.map((b) => (
                <label className="check-chip" key={b.id}>
                  <input type="checkbox" checked={createForm.branchIds.includes(b.id)} onChange={() => toggleCreateBranch(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <button className="primary-btn" onClick={handleCreate}>Create account</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Branch Management ────────────────────────────────────────────────────────
function BranchPanel({ db, helpers, addBranch, saveBranch, deleteBranch }) {
  const [modal, setModal]   = useState(null)   // null | 'new' | branchId
  const [form, setForm]     = useState({ name: '', address: '', lat: '', lng: '', radius: 100, color: '#7986CB' })
  const [editForm, setEditForm] = useState(null)

  const openNew = () => { setForm({ name: '', address: '', lat: '', lng: '', radius: 100, color: '#7986CB' }); setModal('new') }
  const openEdit = (b) => { setEditForm({ ...b, lat: b.lat ?? '', lng: b.lng ?? '' }); setModal(b.id) }

  const handleCreate = () => {
    if (!form.name.trim()) return
    addBranch(form)
    setModal(null)
  }

  const handleSave = () => {
    if (!editForm) return
    saveBranch(editForm.id, editForm)
    setModal(null)
  }

  const BranchForm = ({ f, setF }) => (
    <>
      <label className="field"><span>Branch name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>Address</span><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
      <div className="two-col-form">
        <label className="field"><span>Latitude</span><input type="number" step="0.00001" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="e.g. 1.33968" /></label>
        <label className="field"><span>Longitude</span><input type="number" step="0.00001" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="e.g. 103.77606" /></label>
      </div>
      <label className="field"><span>Clock-in radius (metres)</span><input type="number" min={50} max={500} value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} /></label>
      <label className="field"><span>Colour</span>
        <div className="color-row">
          {['#5b7fb8','#43a047','#e53935','#fb8c00','#AB47BC','#00acc1','#546e7a'].map((c) => (
            <button key={c} className={`color-dot${f.color === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />
          ))}
        </div>
      </label>
    </>
  )

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Branches</div>
        <button className="primary-btn" onClick={openNew}>+ New branch</button>
      </div>
      <div className="branch-grid">
        {db.branches.map((b) => (
          <div key={b.id} className="branch-card" style={{ borderTop: `4px solid ${b.color}` }}>
            <div className="branch-name">{b.name}</div>
            <div className="branch-addr">{b.address || '—'}</div>
            <div className="branch-meta">
              <span>GPS: {b.lat ? `${b.lat}, ${b.lng}` : 'Not set'}</span>
              <span>Radius: {b.radius}m</span>
            </div>
            <div className="branch-staff">
              Staff: {Object.values(db.users).filter((u) => (u.branchIds || []).includes(b.id)).map((u) => u.name).join(', ') || '—'}
            </div>
            <div className="stack-inline" style={{ marginTop: 10 }}>
              <button className="ghost-btn" onClick={() => openEdit(b)}>Edit</button>
              {db.branches.length > 1 && (
                <button className="ghost-btn danger-text" onClick={() => { if (confirm(`Delete branch "${b.name}"?`)) deleteBranch(b.id) }}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal === 'new' && (
        <Modal title="New branch" onClose={() => setModal(null)}>
          <BranchForm f={form} setF={setForm} />
          <button className="primary-btn" onClick={handleCreate}>Create branch</button>
        </Modal>
      )}
      {modal && modal !== 'new' && editForm && (
        <Modal title={`Edit branch — ${editForm.name}`} onClose={() => setModal(null)}>
          <BranchForm f={editForm} setF={setEditForm} />
          <button className="primary-btn" onClick={handleSave}>Save changes</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Shift Templates ─────────────────────────────────────────────────────────
function TemplatesPanel({ db, addShiftTemplate, saveShiftTemplate, deleteShiftTemplate }) {
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState({ name: '', startTime: '09:00', endTime: '18:00', color: '#7986CB' })
  const [editForm, setEditForm] = useState(null)

  const openNew  = () => { setForm({ name: '', startTime: '09:00', endTime: '18:00', color: '#7986CB' }); setModal('new') }
  const openEdit = (t) => { setEditForm({ ...t }); setModal(t.id) }

  const TemplateForm = ({ f, setF }) => (
    <>
      <label className="field"><span>Template name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Morning" /></label>
      <div className="two-col-form">
        <label className="field"><span>Start time</span><input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
        <label className="field"><span>End time</span><input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
      </div>
      <label className="field"><span>Colour</span>
        <div className="color-row">
          {['#FFB74D','#4DB6AC','#7986CB','#e53935','#43a047','#AB47BC','#00acc1'].map((c) => (
            <button key={c} className={`color-dot${f.color === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />
          ))}
        </div>
      </label>
    </>
  )

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Shift templates</div>
        <button className="primary-btn" onClick={openNew}>+ New template</button>
      </div>
      <div className="template-grid">
        {(db.shiftTemplates || []).map((tpl) => (
          <div key={tpl.id} className="template-card" style={{ borderLeft: `5px solid ${tpl.color}` }}>
            <div className="template-name">{tpl.name}</div>
            <div className="template-hours">{tpl.startTime} – {tpl.endTime}</div>
            <div className="stack-inline" style={{ marginTop: 8 }}>
              <button className="ghost-btn" onClick={() => openEdit(tpl)}>Edit</button>
              <button className="ghost-btn danger-text" onClick={() => { if (confirm(`Delete template "${tpl.name}"?`)) deleteShiftTemplate(tpl.id) }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {modal === 'new' && (
        <Modal title="New shift template" onClose={() => setModal(null)}>
          <TemplateForm f={form} setF={setForm} />
          <button className="primary-btn" onClick={() => { if (!form.name) return; addShiftTemplate(form); setModal(null) }}>Create</button>
        </Modal>
      )}
      {modal && modal !== 'new' && editForm && (
        <Modal title={`Edit — ${editForm.name}`} onClose={() => setModal(null)}>
          <TemplateForm f={editForm} setF={setEditForm} />
          <button className="primary-btn" onClick={() => { saveShiftTemplate(editForm.id, editForm); setModal(null) }}>Save</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Schedule ────────────────────────────────────────────────────────────────
function SchedulePanel({ db, helpers, assignShift, deleteShift, currentUserId }) {
  const [selectedUid, setSelectedUid] = useState('')
  const [modal, setModal]             = useState(false)
  const [form, setForm]               = useState({ date: localDateToStr(new Date()), branchId: '', templateId: '', startTime: '09:00', endTime: '18:00', note: '' })

  const staffOptions = Object.entries(db.users).filter(([, u]) => u.role !== 'admin')

  const handleTemplateChange = (templateId) => {
    const tpl = helpers.getShiftTemplate(templateId)
    setForm((f) => ({ ...f, templateId, startTime: tpl?.startTime || f.startTime, endTime: tpl?.endTime || f.endTime }))
  }

  const handleAssign = () => {
    if (!selectedUid || !form.date || !form.branchId) return
    assignShift(selectedUid, form)
    setModal(false)
  }

  const userSchedule = selectedUid ? (db.schedules?.[selectedUid] || []).slice().sort((a, b) => a.date.localeCompare(b.date)) : []

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Shift schedule</div>
        {selectedUid && <button className="primary-btn" onClick={() => setModal(true)}>+ Assign shift</button>}
      </div>
      <label className="field" style={{ maxWidth: 280 }}>
        <span>Select staff member</span>
        <select value={selectedUid} onChange={(e) => setSelectedUid(e.target.value)}>
          <option value="">— Choose staff —</option>
          {staffOptions.map(([uid, u]) => <option key={uid} value={uid}>{u.name} ({helpers.cap(u.role)})</option>)}
        </select>
      </label>

      {selectedUid && (
        <div className="table-card">
          <table>
            <thead><tr><th>Date</th><th>Shift</th><th>Branch</th><th>Time</th><th>Note</th><th>Action</th></tr></thead>
            <tbody>
              {userSchedule.length === 0
                ? <tr><td colSpan="6" className="empty-cell">No shifts scheduled</td></tr>
                : userSchedule.map((s) => {
                    const tpl    = helpers.getShiftTemplate(s.templateId)
                    const branch = helpers.getBranch(s.branchId)
                    return (
                      <tr key={s.id}>
                        <td>{helpers.fmtDate(s.date)}</td>
                        <td>{tpl ? <span style={{ color: tpl.color }}>■ {tpl.name}</span> : 'Custom'}</td>
                        <td>{branch?.name || '—'}</td>
                        <td>{s.startTime} – {s.endTime}</td>
                        <td>{s.note || '—'}</td>
                        <td><button className="ghost-btn danger-text" onClick={() => deleteShift(selectedUid, s.id)}>Remove</button></td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <Modal title={`Assign shift — ${db.users[selectedUid]?.name}`} onClose={() => setModal(false)}>
          <label className="field"><span>Date</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="field"><span>Branch</span>
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">— Select branch —</option>
              {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Shift template</span>
            <select value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
              <option value="">— Custom / none —</option>
              {(db.shiftTemplates || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.startTime}–{t.endTime})</option>)}
            </select>
          </label>
          <div className="two-col-form">
            <label className="field"><span>Start time</span><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
            <label className="field"><span>End time</span><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
          </div>
          <label className="field"><span>Note (optional)</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button className="primary-btn" onClick={handleAssign}>Assign shift</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Leave Types ─────────────────────────────────────────────────────────────
function LeaveTypesPanel({ db, addLeaveType, saveLeaveType, deleteLeaveType }) {
  const [modal, setModal]     = useState(null)  // null | 'new' | id (edit)
  const [form, setForm]       = useState({ name: '', color: '#43a047', defaultDays: 0, requiresFile: false })
  const [editForm, setEditForm] = useState(null)
  const [error, setError]     = useState('')

  const COLORS = ['#43a047','#e53935','#d81b60','#8e24aa','#fb8c00','#f4511e','#6d4c41','#546e7a','#757575','#00acc1','#5b7fb8','#AB47BC']

  const handleCreate = async () => {
    setError('')
    if (!form.name.trim()) return setError('Name is required')
    try {
      await addLeaveType(form)
      setModal(null)
    } catch (err) {
      setError(err.message || 'Failed to create')
    }
  }

  const handleSave = async () => {
    setError('')
    try {
      await saveLeaveType(editForm.id, { color: editForm.color, defaultDays: editForm.defaultDays, requiresFile: editForm.requiresFile })
      setModal(null)
    } catch (err) {
      setError(err.message || 'Failed to save')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this leave type? This cannot be undone if leave records exist.')) return
    try {
      await deleteLeaveType(id)
    } catch (err) {
      alert(err.message)
    }
  }

  const ColorPicker = ({ value, onChange }) => (
    <div className="color-row">
      {COLORS.map((c) => (
        <button key={c} className={`color-dot${value === c ? ' selected' : ''}`} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  )

  const leaveTypes = db.leaveTypes || []

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Leave types</div>
        <button className="primary-btn" onClick={() => { setForm({ name: '', color: '#43a047', defaultDays: 0, requiresFile: false }); setError(''); setModal('new') }}>+ New type</button>
      </div>
      <div className="table-card">
        <table>
          <thead>
            <tr><th>Name</th><th>Colour</th><th>Default days</th><th>Requires doc</th><th>Action</th></tr>
          </thead>
          <tbody>
            {leaveTypes.length === 0
              ? <tr><td colSpan="5" className="empty-cell">No leave types configured</td></tr>
              : leaveTypes.map((lt) => (
                <tr key={lt.id}>
                  <td><span className="lt-swatch" style={{ background: lt.color }} />{lt.name}</td>
                  <td><span className="lt-color-hex">{lt.color}</span></td>
                  <td>{lt.defaultDays === 0 ? 'Unlimited / N/A' : `${lt.defaultDays} days`}</td>
                  <td>{lt.requiresFile ? <Badge tone="warn">Required</Badge> : <Badge>No</Badge>}</td>
                  <td>
                    <div className="stack-inline">
                      <button className="ghost-btn" onClick={() => { setEditForm({ ...lt }); setError(''); setModal(lt.id) }}>Edit</button>
                      <button className="ghost-btn danger-text" onClick={() => handleDelete(lt.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {modal === 'new' && (
        <Modal title="New leave type" onClose={() => setModal(null)}>
          <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emergency Leave" autoFocus /></label>
          <label className="field"><span>Default days (0 = unlimited/unpaid)</span><input type="number" min={0} value={form.defaultDays} onChange={(e) => setForm({ ...form, defaultDays: Number(e.target.value) })} /></label>
          <div className="field"><span>Colour</span><ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></div>
          <label className="check-chip" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={form.requiresFile} onChange={(e) => setForm({ ...form, requiresFile: e.target.checked })} />
            Requires supporting document
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn" onClick={handleCreate}>Create leave type</button>
        </Modal>
      )}

      {modal && modal !== 'new' && editForm && (
        <Modal title={`Edit — ${editForm.name}`} onClose={() => setModal(null)}>
          <label className="field"><span>Default days</span><input type="number" min={0} value={editForm.defaultDays} onChange={(e) => setEditForm({ ...editForm, defaultDays: Number(e.target.value) })} /></label>
          <div className="field"><span>Colour</span><ColorPicker value={editForm.color} onChange={(c) => setEditForm({ ...editForm, color: c })} /></div>
          <label className="check-chip" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={editForm.requiresFile} onChange={(e) => setEditForm({ ...editForm, requiresFile: e.target.checked })} />
            Requires supporting document
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn" onClick={handleSave}>Save changes</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Main AdminPortal ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'leaves',     label: 'Leave requests' },
  { id: 'breakages',  label: 'Breakages' },
  { id: 'schedule',   label: 'Schedule' },
  { id: 'staff',      label: 'Manage staff' },
  { id: 'branches',   label: 'Branches' },
  { id: 'templates',  label: 'Shift templates' },
  { id: 'leave-types', label: 'Leave types' },
  { id: 'calendar',   label: 'Calendar' },
]

export default function AdminPortal({ state }) {
  const {
    db, currentUserId, currentUser, helpers,
    actLeave, addUser, saveStaff, deleteUser, setBalance, resetPassword,
    addBranch, saveBranch, deleteBranch,
    addShiftTemplate, saveShiftTemplate, deleteShiftTemplate,
    assignShift, deleteShift,
    addCalendarEvent, deleteCalendarEvent,
    changePassword, logout,
    addLeaveType, saveLeaveType, deleteLeaveType,
    leaveTypes, loadData,
  } = state

  const [activeTab, setActiveTab] = useState('attendance')
  const notifiedRef  = useRef(new Set())
  const [lateAlerts, setLateAlerts] = useState([])

  const todayBirthdays = useMemo(() => {
    if (!db) return []
    const today = new Date()
    const mmdd  = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return Object.entries(db.users)
      .filter(([, u]) => u.birthday && String(u.birthday).slice(5, 10) === mmdd)
      .map(([uid, u]) => ({ uid, name: u.name }))
  }, [db])

  // Auto-refresh every 60 seconds to catch late clock-ins
  useEffect(() => {
    const id = setInterval(() => { loadData().catch(console.error) }, 60000)
    return () => clearInterval(id)
  }, [loadData])

  // Detect staff who are ≥15 min late and fire dismissable alerts
  useEffect(() => {
    if (!db?.activeSessions) return
    const newAlerts = []
    Object.entries(db.activeSessions).forEach(([uid, session]) => {
      const user     = db.users[uid]
      const shift    = helpers.getTodayShift(uid)
      const expStart = shift?.startTime || user?.expectedStart || ''
      if (!expStart || !session.startedAt) return
      const clockedAt = new Date(session.startedAt)
      const [h, m]    = expStart.split(':').map(Number)
      const expected  = new Date(clockedAt)
      expected.setHours(h, m, 0, 0)
      const lateMin = Math.max(0, Math.round((clockedAt - expected) / 60000))
      if (lateMin >= 15) {
        const key = `${uid}-${session.startedAt}`
        if (!notifiedRef.current.has(key)) {
          notifiedRef.current.add(key)
          newAlerts.push({ uid, name: user?.name || uid, lateMin, key })
        }
      }
    })
    if (newAlerts.length > 0) setLateAlerts((prev) => [...prev, ...newAlerts])
  }, [db?.activeSessions]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismissAlert = useCallback((key) => {
    setLateAlerts((prev) => prev.filter((a) => a.key !== key))
  }, [])

  const pendingCount  = Object.values(db.leaves).flat().filter((l) => l.status === 'pending').length
  const liveCount     = Object.keys(db.activeSessions || {}).length
  const breakageCount = Object.values(db.breakages || {}).flat().length

  return (
    <AppShell user={currentUser} onLogout={logout} onChangePassword={changePassword} activeTab={activeTab} onTabChange={setActiveTab}
      tabs={TABS.map((t) => ({
        ...t,
        label: t.id === 'leaves'     && pendingCount  > 0 ? `${t.label} (${pendingCount})`
             : t.id === 'attendance' && liveCount     > 0 ? `${t.label} ● ${liveCount}`
             : t.id === 'breakages'  && breakageCount > 0 ? `${t.label} (${breakageCount})`
             : t.label,
      }))}>

      {/* Birthday banners */}
      {todayBirthdays.length > 0 && (
        <div className="birthday-bar">
          {todayBirthdays.map(({ uid, name }) => (
            <div key={uid} className="birthday-item">
              🎂 Today is {name}'s birthday! 🎉
            </div>
          ))}
        </div>
      )}

      {/* Late-arrival alert banners */}
      {lateAlerts.length > 0 && (
        <div className="late-alert-bar">
          {lateAlerts.map((alert) => (
            <div key={alert.key} className="late-alert-item">
              <span>⚠ {alert.name} is {alert.lateMin} min late</span>
              <button className="late-alert-dismiss" onClick={() => dismissAlert(alert.key)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'attendance' && <AttendancePanel db={db} helpers={helpers} />}
      {activeTab === 'leaves'     && <LeavesPanel db={db} helpers={helpers} actLeave={actLeave} currentUserId={currentUserId} />}
      {activeTab === 'breakages'  && <BreakagesPanel db={db} helpers={helpers} />}
      {activeTab === 'schedule'   && <SchedulePanel db={db} helpers={helpers} assignShift={assignShift} deleteShift={deleteShift} currentUserId={currentUserId} />}
      {activeTab === 'staff'      && (
        <StaffPanel db={db} helpers={helpers} leaveTypes={leaveTypes}
          addUser={addUser} saveStaff={saveStaff} deleteUser={deleteUser}
          setBalance={setBalance} resetPassword={resetPassword} />
      )}
      {activeTab === 'branches'   && <BranchPanel db={db} helpers={helpers} addBranch={addBranch} saveBranch={saveBranch} deleteBranch={deleteBranch} />}
      {activeTab === 'templates'  && <TemplatesPanel db={db} addShiftTemplate={addShiftTemplate} saveShiftTemplate={saveShiftTemplate} deleteShiftTemplate={deleteShiftTemplate} />}
      {activeTab === 'leave-types' && <LeaveTypesPanel db={db} addLeaveType={addLeaveType} saveLeaveType={saveLeaveType} deleteLeaveType={deleteLeaveType} />}
      {activeTab === 'calendar'   && (
        <CalendarView db={db} helpers={helpers}
          currentUserId={currentUserId} currentUser={currentUser}
          onAddEvent={addCalendarEvent} onDeleteEvent={deleteCalendarEvent} />
      )}
    </AppShell>
  )
}
