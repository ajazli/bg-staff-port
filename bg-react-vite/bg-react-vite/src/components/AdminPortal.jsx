import { useMemo, useState } from 'react'
import { LEAVE_TYPES, WORKDAY_OPTIONS } from '../data/mockData'
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

// ─── Staff CRUD ──────────────────────────────────────────────────────────────
function StaffPanel({ db, helpers, addUser, saveStaff, deleteUser, setBalance, resetPassword }) {
  const [modal, setModal] = useState(null)  // null | 'create' | uid (edit)
  const [form, setForm]   = useState({ name: '', username: '', role: 'staff', branchIds: [], reportsTo: '' })
  const [editForm, setEditForm] = useState(null)
  const [balanceUid, setBalanceUid] = useState(null)
  const [resetUid, setResetUid]   = useState(null)
  const [resetForm, setResetForm] = useState({ next: '', confirm: '' })
  const [resetError, setResetError]   = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  const handleResetPassword = async () => {
    setResetError('')
    setResetSuccess('')
    if (resetForm.next.length < 6) return setResetError('Password must be at least 6 characters.')
    if (resetForm.next !== resetForm.confirm) return setResetError('Passwords do not match.')
    try {
      await resetPassword(resetUid, resetForm.next)
      setResetSuccess('Password reset successfully.')
      setResetForm({ next: '', confirm: '' })
    } catch (err) {
      setResetError(err.message || 'Failed to reset password.')
    }
  }

  const openResetPassword = (uid) => {
    setResetUid(uid)
    setResetForm({ next: '', confirm: '' })
    setResetError('')
    setResetSuccess('')
  }

  const nonAdminUsers = Object.entries(db.users).filter(([, u]) => u.role !== 'admin')

  const openCreate = () => {
    setForm({ name: '', username: '', role: 'staff', branchIds: [], reportsTo: '' })
    setModal('create')
  }

  const openEdit = (uid) => {
    const u = db.users[uid]
    setEditForm({ ...u, uid, workDays: [...(u.workDays || [1,2,3,4,5])] })
    setModal(uid)
  }

  const handleCreate = () => {
    if (!form.name.trim() || !form.username.trim()) return
    addUser({ ...form, reportsTo: form.reportsTo || null })
    setModal(null)
  }

  const handleSave = () => {
    if (!editForm) return
    const { uid, ...payload } = editForm
    saveStaff(uid, payload)
    setModal(null)
  }

  const toggleBranch = (setter, branchId) => {
    setter((prev) => ({
      ...prev,
      branchIds: prev.branchIds.includes(branchId)
        ? prev.branchIds.filter((id) => id !== branchId)
        : [...prev.branchIds, branchId],
    }))
  }

  const toggleDay = (setter, val) => {
    setter((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(val)
        ? prev.workDays.filter((d) => d !== val)
        : [...prev.workDays, val],
    }))
  }

  // Build hierarchy display
  const renderTree = (uid, depth = 0) => {
    const u = db.users[uid]
    if (!u) return null
    const reports = Object.entries(db.users).filter(([id, usr]) => usr.reportsTo === uid && id !== uid)
    return (
      <div key={uid} style={{ marginLeft: depth * 20 }}>
        <div className="tree-node">
          <span className="tree-dot" />
          <span className="tree-name">{u.name}</span>
          <Badge tone={u.role === 'team_lead' ? 'info' : 'default'}>{helpers.cap(u.role)}</Badge>
        </div>
        {reports.map(([id]) => renderTree(id, depth + 1))}
      </div>
    )
  }

  return (
    <div className="two-col admin-layout">
      {/* Staff table */}
      <div>
        <div className="section-header">
          <div className="section-title">Team members</div>
          <button className="primary-btn" onClick={openCreate}>+ Add staff</button>
        </div>
        <div className="table-card">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Branch(es)</th><th>Reports to</th><th>Actions</th></tr></thead>
            <tbody>
              {nonAdminUsers.map(([uid, u]) => (
                <tr key={uid}>
                  <td>{u.name}</td>
                  <td><Badge tone={u.role === 'team_lead' ? 'info' : 'default'}>{helpers.cap(u.role)}</Badge></td>
                  <td>{helpers.getUserBranches(uid).map((b) => b.name).join(', ') || '—'}</td>
                  <td>{u.reportsTo ? db.users[u.reportsTo]?.name || u.reportsTo : '—'}</td>
                  <td>
                    <div className="stack-inline">
                      <button className="ghost-btn" onClick={() => openEdit(uid)}>Edit</button>
                      <button className="ghost-btn" onClick={() => setBalanceUid(uid)}>Leave bal.</button>
                      <button className="ghost-btn" onClick={() => openResetPassword(uid)}>Reset pwd</button>
                      <button className="ghost-btn danger-text" onClick={() => { if (confirm(`Delete ${u.name}?`)) deleteUser(uid) }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hierarchy tree */}
      <div className="panel">
        <div className="section-title">Reporting hierarchy</div>
        {renderTree('admin')}
        {/* Unattached users */}
        {Object.entries(db.users)
          .filter(([id, u]) => u.reportsTo === null && id !== 'admin')
          .map(([id]) => renderTree(id))}
      </div>

      {/* Create user modal */}
      {modal === 'create' && (
        <Modal title="Add new team member" onClose={() => setModal(null)}>
          <label className="field"><span>Full name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Username</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label className="field"><span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="team_lead">Team Lead</option>
            </select>
          </label>
          <label className="field"><span>Reports to</span>
            <select value={form.reportsTo} onChange={(e) => setForm({ ...form, reportsTo: e.target.value })}>
              <option value="">— None —</option>
              {Object.entries(db.users).filter(([, u]) => u.role !== 'staff').map(([id, u]) => (
                <option key={id} value={id}>{u.name} ({helpers.cap(u.role)})</option>
              ))}
            </select>
          </label>
          <div className="field"><span>Branches</span>
            <div className="check-grid">{db.branches.map((b) => (
              <label className="check-chip" key={b.id}>
                <input type="checkbox" checked={form.branchIds.includes(b.id)} onChange={() => toggleBranch(setForm, b.id)} /> {b.name}
              </label>
            ))}</div>
          </div>
          <button className="primary-btn" onClick={handleCreate}>Create account</button>
        </Modal>
      )}

      {/* Edit user modal */}
      {modal && modal !== 'create' && editForm && (
        <Modal title={`Edit — ${editForm.name}`} onClose={() => setModal(null)} width={520}>
          <div className="two-col-form">
            <label className="field"><span>Full name</span><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
            <label className="field"><span>Role</span>
              <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="team_lead">Team Lead</option>
              </select>
            </label>
            <label className="field"><span>Reports to</span>
              <select value={editForm.reportsTo || ''} onChange={(e) => setEditForm({ ...editForm, reportsTo: e.target.value || null })}>
                <option value="">— None —</option>
                {Object.entries(db.users).filter(([id, u]) => id !== modal && u.role !== 'staff').map(([id, u]) => (
                  <option key={id} value={id}>{u.name} ({helpers.cap(u.role)})</option>
                ))}
              </select>
            </label>
            <label className="field"><span>Expected start</span><input type="time" value={editForm.expectedStart} onChange={(e) => setEditForm({ ...editForm, expectedStart: e.target.value })} /></label>
            <label className="field"><span>Expected end</span><input type="time" value={editForm.expectedEnd} onChange={(e) => setEditForm({ ...editForm, expectedEnd: e.target.value })} /></label>
          </div>
          <div className="field"><span>Work days</span>
            <div className="check-grid">{WORKDAY_OPTIONS.map((opt) => (
              <label className="check-chip" key={opt.value}>
                <input type="checkbox" checked={(editForm.workDays || []).includes(opt.value)} onChange={() => toggleDay(setEditForm, opt.value)} /> {opt.label}
              </label>
            ))}</div>
          </div>
          <div className="field"><span>Branches</span>
            <div className="check-grid">{db.branches.map((b) => (
              <label className="check-chip" key={b.id}>
                <input type="checkbox" checked={(editForm.branchIds || []).includes(b.id)} onChange={() => toggleBranch(setEditForm, b.id)} /> {b.name}
              </label>
            ))}</div>
          </div>
          <label className="field"><span>Memo</span><textarea value={editForm.memo || ''} onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })} /></label>
          <button className="primary-btn" onClick={handleSave}>Save changes</button>
        </Modal>
      )}

      {/* Leave balance modal */}
      {balanceUid && (
        <Modal title={`Leave balances — ${db.users[balanceUid]?.name}`} onClose={() => setBalanceUid(null)} width={560}>
          <div className="table-card">
            <table>
              <thead><tr><th>Leave type</th><th>Total (days)</th><th>Used</th><th>Remaining</th></tr></thead>
              <tbody>
                {LEAVE_TYPES.map((lt) => {
                  const bal = db.balances[balanceUid]?.[lt.id] || { total: 0, used: 0 }
                  return (
                    <tr key={lt.id}>
                      <td style={{ color: lt.color }}>{lt.label}</td>
                      <td><input type="number" className="inline-input num-input" min={0} value={bal.total} onChange={(e) => setBalance(balanceUid, lt.id, 'total', e.target.value)} /></td>
                      <td>{bal.used}</td>
                      <td>{bal.total - bal.used}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {/* Reset password modal */}
      {resetUid && (
        <Modal title={`Reset password — ${db.users[resetUid]?.name}`} onClose={() => setResetUid(null)}>
          <label className="field"><span>New password</span>
            <input type="password" value={resetForm.next} onChange={(e) => setResetForm({ ...resetForm, next: e.target.value })} />
          </label>
          <label className="field"><span>Confirm new password</span>
            <input type="password" value={resetForm.confirm} onChange={(e) => setResetForm({ ...resetForm, confirm: e.target.value })} />
          </label>
          {resetError   && <div className="error-box">{resetError}</div>}
          {resetSuccess && <div className="success-box">{resetSuccess}</div>}
          <button className="primary-btn" onClick={handleResetPassword}>Reset password</button>
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

// ─── Main AdminPortal ─────────────────────────────────────────────────────────
const TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'leaves',     label: 'Leave requests' },
  { id: 'schedule',   label: 'Schedule' },
  { id: 'staff',      label: 'Manage staff' },
  { id: 'branches',   label: 'Branches' },
  { id: 'templates',  label: 'Shift templates' },
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
    changePassword,
    logout,
  } = state

  const [activeTab, setActiveTab] = useState('attendance')

  const pendingCount = Object.values(db.leaves).flat().filter((l) => l.status === 'pending').length
  const liveCount    = Object.keys(db.activeSessions || {}).length

  return (
    <AppShell user={currentUser} onLogout={logout} onChangePassword={changePassword} activeTab={activeTab} onTabChange={setActiveTab}
      tabs={TABS.map((t) => ({
        ...t,
        label: t.id === 'leaves' && pendingCount > 0 ? `${t.label} (${pendingCount})`
             : t.id === 'attendance' && liveCount > 0 ? `${t.label} ● ${liveCount}`
             : t.label,
      }))}>

      {activeTab === 'attendance' && (
        <AttendancePanel db={db} helpers={helpers} />
      )}
      {activeTab === 'leaves' && (
        <LeavesPanel db={db} helpers={helpers} actLeave={actLeave} currentUserId={currentUserId} />
      )}
      {activeTab === 'schedule' && (
        <SchedulePanel db={db} helpers={helpers} assignShift={assignShift} deleteShift={deleteShift} currentUserId={currentUserId} />
      )}
      {activeTab === 'staff' && (
        <StaffPanel db={db} helpers={helpers} addUser={addUser} saveStaff={saveStaff} deleteUser={deleteUser} setBalance={setBalance} resetPassword={resetPassword} />
      )}
      {activeTab === 'branches' && (
        <BranchPanel db={db} helpers={helpers} addBranch={addBranch} saveBranch={saveBranch} deleteBranch={deleteBranch} />
      )}
      {activeTab === 'templates' && (
        <TemplatesPanel db={db} addShiftTemplate={addShiftTemplate} saveShiftTemplate={saveShiftTemplate} deleteShiftTemplate={deleteShiftTemplate} />
      )}
      {activeTab === 'calendar' && (
        <CalendarView
          db={db} helpers={helpers}
          currentUserId={currentUserId} currentUser={currentUser}
          onAddEvent={addCalendarEvent} onDeleteEvent={deleteCalendarEvent}
        />
      )}
    </AppShell>
  )
}
