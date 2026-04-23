import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { haversineMeters, localDateToStr } from '../utils'
import AppShell from './AppShell'
import Badge from './Badge'
import CalendarView from './CalendarView'
import Modal from './Modal'

const MAX_FILE_BYTES = 3 * 1024 * 1024  // 3 MB

// ─── Stats bar ───────────────────────────────────────────────────────────────
function Stats({ weekHours, annualLeft, presentDays }) {
  return (
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">Hours this week</div><div className="stat-value">{weekHours}</div><div className="stat-sub">Mon–Sun</div></div>
      <div className="stat-card"><div className="stat-label">Annual leave left</div><div className="stat-value">{annualLeft}</div><div className="stat-sub">days remaining</div></div>
      <div className="stat-card"><div className="stat-label">Days present</div><div className="stat-value">{presentDays}</div><div className="stat-sub">this month</div></div>
    </div>
  )
}

// ─── Clock tab ───────────────────────────────────────────────────────────────
const ROLES_OF_DAY = ['Incharge', 'Barista', 'Service', 'Grab Packer', 'Kitchen Staff', 'Dishwasher']

function ClockTab({ userId, user, db, helpers, clockSession, onClockIn, onClockOut, onBreakStart, onBreakEnd, onSetRoleOfDay, currentBranchId }) {
  const [liveTime, setLiveTime]         = useState(new Date())
  const [branchId, setBranchId]         = useState(user.branchIds?.[0] || db.branches[0]?.id || '')
  const [gpsStatus, setGpsStatus]       = useState('')  // 'checking' | 'ok' | error string
  const [clockError, setClockError]     = useState('')
  const [phNotice, setPhNotice]         = useState('')
  const [eodModal, setEodModal]         = useState(false)
  const [eodNote, setEodNote]           = useState('')
  const [eodSubmitting, setEodSubmitting] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const attendance   = db.attendance[userId] || []
  const weekHours    = useMemo(() => {
    const now  = new Date()
    const dow  = now.getDay()
    const sow  = new Date(now); sow.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); sow.setHours(0,0,0,0)
    let total  = 0
    attendance.forEach((r) => {
      const d = new Date(r.date)
      if (d >= sow) { const m = /(?<h>\d+)h\s(?<m>\d+)m/.exec(r.hours || ''); if (m) total += Number(m.groups.h)*60+Number(m.groups.m) }
    })
    return `${Math.floor(total/60)}h ${total%60}m`
  }, [attendance])
  const presentDays  = useMemo(() => {
    const now = new Date()
    return attendance.filter((r) => { const d = new Date(r.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() }).length
  }, [attendance])

  const handleClockIn = () => {
    setClockError('')
    const branch = helpers.getBranch(branchId)
    if (!branch) return
    if (!branch.lat || !branch.lng) {
      onClockIn(branchId, { locOk: false }).catch(err => setClockError(err.message || 'Clock-in failed'))
      return
    }
    setGpsStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, branch.lat, branch.lng)
        if (dist <= branch.radius) {
          setGpsStatus('ok')
          onClockIn(branchId, { locOk: true }).catch(err => setClockError(err.message || 'Clock-in failed'))
        } else {
          setGpsStatus(`Too far — you are ${Math.round(dist)}m from ${branch.name} (max ${branch.radius}m).`)
        }
      },
      (err) => {
        setGpsStatus(`Location error: ${err.message}. Clock-in blocked.`)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const openEodModal = () => { setEodNote(''); setEodModal(true) }

  const handleEodSubmit = async () => {
    if (!eodNote.trim()) return
    setEodSubmitting(true)
    try {
      const result = await onClockOut(eodNote)
      setEodModal(false)
      if (result?.phCredited) setPhNotice(`You worked on ${result.phName}. One PH Off-in-Lieu day has been credited.`)
    } finally {
      setEodSubmitting(false)
    }
  }

  const todayShift = helpers.getTodayShift(userId)
  const todayBranch = todayShift ? helpers.getBranch(todayShift.branchId) : null
  const breakAllowed = todayShift ? todayShift.breakAllowed !== false : true

  // Feature 5: 60-minute break countdown
  const breakElapsedMins = clockSession.onBreak && clockSession.breakStartedAt
    ? Math.floor((liveTime - new Date(clockSession.breakStartedAt)) / 60000)
    : 0
  const breakSecsLeft = clockSession.onBreak && clockSession.breakStartedAt
    ? Math.max(0, 60*60 - Math.floor((liveTime - new Date(clockSession.breakStartedAt)) / 1000))
    : 0
  const breakMinsLeft = Math.floor(breakSecsLeft/60)
  const breakSecsRem  = breakSecsLeft%60
  const breakOver = breakElapsedMins >= 60

  return (
    <section>
      <Stats weekHours={weekHours} annualLeft={helpers.getBalanceRemaining(userId, 'Annual Leave')} presentDays={presentDays} />

      {todayShift && (
        <div className="info-panel shift-today">
          <strong>Today's shift:</strong> {helpers.getShiftTemplate(todayShift.templateId)?.name || 'Custom'} &nbsp;
          {todayShift.startTime}–{todayShift.endTime} at {todayBranch?.name || '—'}
        </div>
      )}

      <div className="panel clock-panel">
        <div className="clock-time">{liveTime.toLocaleTimeString('en-SG', { hour12: false })}</div>
        <div className="clock-date">{liveTime.toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <div className="status-row">
          {clockSession.active
            ? <Badge tone="success">Clocked in — {clockSession.branchName}</Badge>
            : <Badge>Not clocked in</Badge>}
        </div>

        {!clockSession.active && (
          <label className="field max-280">
            <span>Branch</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {helpers.getUserBranches(userId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}

        {gpsStatus === 'checking' && <div className="gps-checking">Checking location…</div>}
        {gpsStatus && gpsStatus !== 'checking' && gpsStatus !== 'ok' && <div className="error-box">{gpsStatus}</div>}
        {clockError && <div className="error-box">{clockError}</div>}
        {phNotice && <div className="info-panel">{phNotice}</div>}

        <button
          className={`primary-btn${clockSession.active ? ' danger' : ''}`}
          onClick={clockSession.active ? openEodModal : handleClockIn}
          disabled={gpsStatus === 'checking'}
        >
          {clockSession.active ? 'Clock Out' : 'Clock In'}
        </button>

        {clockSession.active && (
          <>
            {/* Role of the day selector */}
            <div className="role-selector">
              <div className="role-label">Role today</div>
              <div className="role-chips">
                {ROLES_OF_DAY.map((r) => (
                  <button key={r} type="button"
                    className={`role-chip${clockSession.roleOfDay === r ? ' active' : ''}`}
                    onClick={() => onSetRoleOfDay(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Break controls */}
            <div className="break-section">
              {!breakAllowed ? (
                <div style={{color:'var(--muted)',fontSize:13}}>No break for today's shift</div>
              ) : clockSession.onBreak ? (
                <>
                  <div className="break-status">
                    <Badge tone="warn">On break{clockSession.breakStartedAt ? ` since ${new Date(clockSession.breakStartedAt).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</Badge>
                  </div>
                  <div style={{fontSize:13,marginBottom:8,color:breakOver?'var(--danger)':'var(--muted)'}}>
                    {breakOver
                      ? `⚠ Over by ${breakElapsedMins-60}m — please end break`
                      : `Time remaining: ${breakMinsLeft}m ${String(breakSecsRem).padStart(2,'0')}s`}
                  </div>
                  <button className="primary-btn break-end-btn" onClick={onBreakEnd}>End Break</button>
                </>
              ) : (
                <button className="ghost-btn break-start-btn" onClick={onBreakStart}>Start Break</button>
              )}
            </div>
          </>
        )}

        {/* EOD note modal */}
        {eodModal && (
          <Modal title="End of day" onClose={() => setEodModal(false)}>
            <p className="eod-prompt">Before clocking out, what happened during the day?</p>
            <label className="field">
              <span>Daily notes</span>
              <textarea
                value={eodNote}
                onChange={(e) => setEodNote(e.target.value)}
                placeholder="Summarise your shift, any issues, handover notes…"
                autoFocus
              />
            </label>
            {!eodNote.trim() && <div className="hint" style={{ marginBottom: 12 }}>Please add your end-of-day notes before clocking out.</div>}
            <button className="primary-btn danger" onClick={handleEodSubmit}
              disabled={!eodNote.trim() || eodSubmitting}>
              {eodSubmitting ? 'Clocking out…' : 'Submit & Clock Out'}
            </button>
          </Modal>
        )}

        {!clockSession.active && (
          <div className="gps-info">
            <span className="gps-icon">📍</span>
            {helpers.getBranch(branchId)?.address || 'Select branch above'}
          </div>
        )}
      </div>

      <div className="section-title">Recent attendance</div>
      <div className="table-card">
        <table>
          <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Branch</th><th>Location</th><th>Status</th></tr></thead>
          <tbody>
            {attendance.length === 0
              ? <tr><td colSpan="7" className="empty-cell">No attendance records yet</td></tr>
              : attendance.slice(0, 10).map((rec, idx) => (
                <tr key={`${rec.date}-${idx}`}>
                  <td>{helpers.fmtDate(rec.date)}</td>
                  <td>{rec.in}</td>
                  <td>{rec.out || '—'}</td>
                  <td>{rec.hours || '—'}</td>
                  <td>{rec.branchName}</td>
                  <td><Badge tone={rec.locOk ? 'success' : 'danger'}>{rec.locOk ? 'On-site' : 'Flagged'}</Badge></td>
                  <td>
                    <div className="stack-inline">
                      <Badge tone="success">{helpers.cap(rec.status)}</Badge>
                      {helpers.getTimingBadges(rec).map((t) => <Badge key={t} tone={t.includes('Late') || t.includes('early') ? 'warn' : 'info'}>{t}</Badge>)}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {clockSession.active && (() => {
        const colleagues = Object.entries(db.activeSessions || {})
          .filter(([uid, sess]) => uid !== userId && sess.branchId === clockSession.branchId)
          .map(([uid, sess]) => ({ uid, name: db.users[uid]?.name || uid, startedAt: sess.startedAt }))
        return (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>
              Colleagues on shift — {clockSession.branchName}
            </div>
            <div className="table-card">
              <table>
                <thead><tr><th>Name</th><th>Clocked in at</th></tr></thead>
                <tbody>
                  {colleagues.length === 0
                    ? <tr><td colSpan="2" className="empty-cell">No colleagues clocked in at this branch</td></tr>
                    : colleagues.map((c) => (
                      <tr key={c.uid}>
                        <td>{c.name}</td>
                        <td>{new Date(c.startedAt).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )
      })()}
    </section>
  )
}

// ─── My Schedule ─────────────────────────────────────────────────────────────
function ScheduleTab({ userId, user, db, helpers, isTeamLead, assignShift, deleteShift }) {
  const today      = localDateToStr(new Date())
  const mySchedule = (db.schedules?.[userId] || []).slice().sort((a, b) => a.date.localeCompare(b.date))
  const upcoming   = mySchedule.filter((s) => s.date >= today)
  const past       = mySchedule.filter((s) => s.date < today)

  // Team lead: assign shifts to their direct reports
  const [assignUid, setAssignUid]  = useState('')
  const [modal, setModal]          = useState(false)
  const [form, setForm]            = useState({ date: today, branchId: user.branchIds?.[0] || '', templateId: '', startTime: '09:00', endTime: '18:00', note: '' })

  const reports = isTeamLead ? helpers.getDirectReports(userId) : []

  const handleTemplateChange = (templateId) => {
    const tpl = helpers.getShiftTemplate(templateId)
    setForm((f) => ({ ...f, templateId, startTime: tpl?.startTime || f.startTime, endTime: tpl?.endTime || f.endTime }))
  }

  const handleAssign = () => {
    if (!assignUid || !form.date || !form.branchId) return
    assignShift(assignUid, form)
    setModal(false)
  }

  const ShiftRow = ({ s, uid }) => {
    const tpl    = helpers.getShiftTemplate(s.templateId)
    const branch = helpers.getBranch(s.branchId)
    const isPast = s.date < today
    return (
      <tr style={{ opacity: isPast ? 0.6 : 1 }}>
        <td>{helpers.fmtDate(s.date)}</td>
        <td>{tpl ? <span style={{ color: tpl.color }}>■ {tpl.name}</span> : 'Custom'}</td>
        <td>{s.startTime} – {s.endTime}</td>
        <td>{branch?.name || '—'}</td>
        <td>{s.note || '—'}</td>
        {isTeamLead && uid !== userId && (
          <td><button className="ghost-btn danger-text" onClick={() => deleteShift(uid, s.id)}>Remove</button></td>
        )}
      </tr>
    )
  }

  return (
    <section>
      {/* My upcoming shifts */}
      <div className="section-title">My upcoming shifts</div>
      <div className="table-card">
        <table>
          <thead><tr><th>Date</th><th>Shift</th><th>Time</th><th>Branch</th><th>Note</th></tr></thead>
          <tbody>
            {upcoming.length === 0
              ? <tr><td colSpan="5" className="empty-cell">No upcoming shifts</td></tr>
              : upcoming.map((s) => <ShiftRow key={s.id} s={s} uid={userId} />)}
          </tbody>
        </table>
      </div>
      {past.length > 0 && <>
        <div className="section-title" style={{ marginTop: 20 }}>Past shifts</div>
        <div className="table-card">
          <table>
            <thead><tr><th>Date</th><th>Shift</th><th>Time</th><th>Branch</th><th>Note</th></tr></thead>
            <tbody>{past.slice(0, 5).map((s) => <ShiftRow key={s.id} s={s} uid={userId} />)}</tbody>
          </table>
        </div>
      </>}

      {/* Team lead: manage team schedules */}
      {isTeamLead && reports.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 24 }}>
            <div className="section-title">Team schedules</div>
            <button className="primary-btn" onClick={() => setModal(true)}>+ Assign shift</button>
          </div>
          {reports.map((rep) => {
            const repSchedule = (db.schedules?.[rep.id] || []).slice().sort((a, b) => a.date.localeCompare(b.date))
            return (
              <div key={rep.id} style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ fontSize: 14 }}>{rep.name}</div>
                <div className="table-card compact">
                  <table>
                    <thead><tr><th>Date</th><th>Shift</th><th>Time</th><th>Branch</th><th>Note</th><th>Action</th></tr></thead>
                    <tbody>
                      {repSchedule.length === 0
                        ? <tr><td colSpan="6" className="empty-cell">No shifts</td></tr>
                        : repSchedule.map((s) => <ShiftRow key={s.id} s={s} uid={rep.id} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {modal && (
            <Modal title="Assign shift to team member" onClose={() => setModal(false)}>
              <label className="field"><span>Team member</span>
                <select value={assignUid} onChange={(e) => setAssignUid(e.target.value)}>
                  <option value="">— Select —</option>
                  {reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Date</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label className="field"><span>Branch</span>
                <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">— Select —</option>
                  {db.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Template</span>
                <select value={form.templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
                  <option value="">— Custom —</option>
                  {(db.shiftTemplates || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.startTime}–{t.endTime})</option>)}
                </select>
              </label>
              <div className="two-col-form">
                <label className="field"><span>Start</span><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
                <label className="field"><span>End</span><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
              </div>
              <button className="primary-btn" onClick={handleAssign}>Assign shift</button>
            </Modal>
          )}
        </>
      )}
    </section>
  )
}

// ─── Apply Leave ─────────────────────────────────────────────────────────────
function LeaveApplyTab({ userId, db, helpers, onSubmitLeave, leaveTypes }) {
  const INIT = { type: 'Annual Leave', start: '', end: '', reason: '', attachment: null }
  const [form, setForm]   = useState(INIT)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef()

  const leaveType    = leaveTypes.find((t) => t.id === form.type)
  const needsFile    = leaveType?.requiresFile || false
  const balances     = db.balances[userId] || {}
  const selectedBal  = leaveType ? (balances[leaveType.id] || { total: 0, used: 0 }) : null
  const selectedRem  = selectedBal ? selectedBal.total - selectedBal.used : 0
  // Unlimited only when admin has not set a positive total AND type has no built-in default
  const isUnlimited  = (selectedBal?.total ?? 0) === 0 && (leaveType?.defaultDays ?? 0) === 0

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) { setError('File must be under 3 MB.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setForm((f) => ({ ...f, attachment: { name: file.name, url: ev.target.result } }))
    reader.readAsDataURL(file)
    setError('')
  }

  const handleSubmit = () => {
    setError('')
    if (!form.start || !form.end) return setError('Please select start and end dates.')
    if (form.start > form.end) return setError('End date must be after start date.')
    if (needsFile && !form.attachment) return setError('Please attach the required document for this leave type.')
    onSubmitLeave({ type: form.type, start: form.start, end: form.end, reason: form.reason, attachmentName: form.attachment?.name || '', attachmentUrl: form.attachment?.url || '' })
    setForm(INIT)
    if (fileRef.current) fileRef.current.value = ''
    setSuccess('Leave application submitted successfully.')
    setTimeout(() => setSuccess(''), 4000)
  }

  return (
    <section className="two-col">
      <div className="panel">
        <div className="section-title">Apply for leave</div>
        <label className="field">
          <span>Leave type</span>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, attachment: null })}>
            {leaveTypes.map((t) => {
              const bal  = (db.balances[userId]||{})[t.id]||{total:0,used:0}
              const unli = bal.total === 0 && t.defaultDays === 0
              const rem  = unli ? 'Unlimited' : `${bal.total-bal.used} day${bal.total-bal.used!==1?'s':''} left`
              return <option key={t.id} value={t.id}>{t.label||t.name} — {rem}{t.requiresFile?' (doc required)':''}</option>
            })}
          </select>
        </label>

        {leaveType && selectedBal && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: `${leaveType.color}15`,
            border: `1px solid ${leaveType.color}55`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 4,
          }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: isUnlimited || selectedRem > 0 ? leaveType.color : 'var(--danger)', lineHeight: 1 }}>
              {isUnlimited ? '∞' : selectedRem}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                {isUnlimited ? 'No limit' : `day${selectedRem !== 1 ? 's' : ''} remaining`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {isUnlimited
                  ? `${selectedBal.used} day${selectedBal.used !== 1 ? 's' : ''} taken`
                  : `${selectedBal.used} used of ${selectedBal.total} total`}
              </div>
            </div>
            {!isUnlimited && selectedRem === 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
                No days left
              </span>
            )}
          </div>
        )}

        <div className="two-col-form">
          <label className="field"><span>Start date</span><input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label className="field"><span>End date</span><input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
        </div>
        <label className="field"><span>Reason</span><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional — describe your reason" /></label>

        {needsFile && (
          <div className="field">
            <span>Supporting document <span className="req-star">*required</span></span>
            <div className="upload-area" onClick={() => fileRef.current?.click()}>
              {form.attachment
                ? <><span className="upload-icon">📎</span>{form.attachment.name}</>
                : <><span className="upload-icon">⬆️</span>Click to upload (PDF, JPG, PNG — max 3 MB)</>}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleFile} />
          </div>
        )}

        {error   && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}
        <p className="hint">* indicates a supporting document is required by Singapore law.</p>
        <button className="primary-btn" onClick={handleSubmit}>Submit application</button>
      </div>

      <div className="panel">
        <div className="section-title">Your leave balances</div>
        <div className="balance-grid">
          {leaveTypes.map((lt) => {
            const bal = balances[lt.id] || { total: 0, used: 0 }
            const rem = bal.total - bal.used
            const unlimited = bal.total === 0 && lt.defaultDays === 0
            const low = !unlimited && rem === 0
            return (
              <div className="balance-card" key={lt.id}
                style={{ borderTop: `3px solid ${lt.color}`, outline: form.type === lt.id ? `2px solid ${lt.color}` : 'none' }}>
                <div className="balance-title" style={{ color: lt.color }}>{lt.label || lt.name}</div>
                {unlimited
                  ? <div className="balance-value">∞</div>
                  : <div className="balance-value" style={{ color: low ? 'var(--danger)' : lt.color }}>{rem}</div>}
                <div className="balance-sub">
                  {unlimited
                    ? `${bal.used} day${bal.used !== 1 ? 's' : ''} taken`
                    : `${bal.used} used / ${bal.total} total`}
                </div>
                {low && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginTop: 2 }}>No days left</div>}
              </div>
            )
          })}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Balances are set by your admin.</p>
      </div>
    </section>
  )
}

// ─── Leave History ────────────────────────────────────────────────────────────
function LeaveHistoryTab({ userId, db, helpers, onRevokeLeave }) {
  const leaves = db.leaves[userId] || []

  if (leaves.length === 0) {
    return (
      <section>
        <div className="section-title">My leave history</div>
        <div className="table-card"><div className="empty-cell">No leave history yet</div></div>
      </section>
    )
  }

  return (
    <section>
      <div className="section-title">My leave history</div>

      {/* Desktop table */}
      <div className="table-card leave-table-desktop">
        <table>
          <thead>
            <tr>
              <th>Type</th><th>Start</th><th>End</th><th>Days</th>
              <th>Reason</th><th>Doc</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leave, index) => {
              const lt = helpers.getLeaveType(leave.type)
              return (
                <tr key={leave.id || `${leave.type}-${leave.start}-${index}`}>
                  <td><span style={{ color: lt?.color }}>{leave.type}</span></td>
                  <td>{helpers.fmtDate(leave.start)}</td>
                  <td>{helpers.fmtDate(leave.end)}</td>
                  <td>{leave.days}</td>
                  <td className="td-reason">{leave.reason || '—'}</td>
                  <td>
                    {leave.attachmentUrl
                      ? <a href={leave.attachmentUrl} download={leave.attachmentName} className="link-btn">{leave.attachmentName}</a>
                      : '—'}
                  </td>
                  <td><Badge tone={leave.status === 'approved' ? 'success' : leave.status === 'rejected' ? 'danger' : 'info'}>{helpers.cap(leave.status)}</Badge></td>
                  <td>{leave.status === 'pending' ? <button className="ghost-btn danger-text" onClick={() => onRevokeLeave(leave.id)}>Revoke</button> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="leave-cards-mobile">
        {leaves.map((leave, index) => {
          const lt = helpers.getLeaveType(leave.type)
          return (
            <div key={leave.id || `${leave.type}-${leave.start}-${index}`} className="leave-card">
              <div className="leave-card-header">
                <span className="leave-card-type" style={{ color: lt?.color }}>{leave.type}</span>
                <Badge tone={leave.status === 'approved' ? 'success' : leave.status === 'rejected' ? 'danger' : 'info'}>{helpers.cap(leave.status)}</Badge>
              </div>
              <div className="leave-card-dates">
                {helpers.fmtDate(leave.start)} — {helpers.fmtDate(leave.end)}
                <span className="leave-card-days"> · {leave.days} day{leave.days !== 1 ? 's' : ''}</span>
              </div>
              {leave.reason && <div className="leave-card-reason">{leave.reason}</div>}
              {(leave.attachmentUrl || leave.status === 'pending') && (
                <div className="leave-card-footer">
                  {leave.attachmentUrl && (
                    <a href={leave.attachmentUrl} download={leave.attachmentName} className="link-btn">{leave.attachmentName}</a>
                  )}
                  {leave.status === 'pending' && (
                    <button className="ghost-btn danger-text" onClick={() => onRevokeLeave(leave.id)}>Revoke</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Breakage Tab ────────────────────────────────────────────────────────────
const MAX_IMG_BYTES = 5 * 1024 * 1024  // 5 MB

function BreakageTab({ userId, db, helpers, onSubmitBreakage }) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const nowStr   = today.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })

  const INIT = { date: todayStr, time: nowStr, reason: '', attachment: null }
  const [form, setForm]       = useState(INIT)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const imgRef = useRef()

  const handleImg = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMG_BYTES) { setError('Image must be under 5 MB.'); return }
    if (!file.type.startsWith('image/')) { setError('Only image files are accepted.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setForm((f) => ({ ...f, attachment: { name: file.name, url: ev.target.result } }))
    reader.readAsDataURL(file)
    setError('')
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!form.date) return setError('Please select a date.')
    if (!form.reason.trim()) return setError('Please describe what happened.')
    try {
      await onSubmitBreakage({
        date: form.date, time: form.time, reason: form.reason,
        attachmentName: form.attachment?.name || '',
        attachmentUrl:  form.attachment?.url  || '',
      })
      setForm(INIT)
      if (imgRef.current) imgRef.current.value = ''
      setSuccess('Breakage report submitted.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message || 'Failed to submit report.')
    }
  }

  const myBreakages = (db.breakages?.[userId] || [])

  return (
    <section>
      <div className="two-col breakage-layout">
        {/* Submit form */}
        <div className="panel">
          <div className="section-title">Report a breakage</div>
          <div className="two-col-form">
            <label className="field">
              <span>Date</span>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              <span>Time</span>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>What was broken / what happened</span>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Describe the item and how it broke…"
              rows={4}
            />
          </label>
          <div className="field">
            <span>Photo of breakage <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></span>
            <div className="upload-area" onClick={() => imgRef.current?.click()}>
              {form.attachment
                ? (
                  <div className="breakage-preview">
                    <img src={form.attachment.url} alt="preview" className="breakage-thumb" />
                    <span className="breakage-fname">{form.attachment.name}</span>
                  </div>
                )
                : <><span className="upload-icon">📷</span>Click to upload photo (JPG, PNG — max 5 MB)</>}
            </div>
            <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImg} />
          </div>
          {form.attachment && (
            <button
              className="ghost-btn"
              style={{ marginBottom: 12 }}
              onClick={() => { setForm((f) => ({ ...f, attachment: null })); if (imgRef.current) imgRef.current.value = '' }}
            >
              Remove photo
            </button>
          )}
          {error   && <div className="error-box">{error}</div>}
          {success && <div className="success-box">{success}</div>}
          <button className="primary-btn" onClick={handleSubmit}>Submit report</button>
        </div>

        {/* History */}
        <div>
          <div className="section-title">My breakage history</div>
          {myBreakages.length === 0
            ? <div className="table-card"><div className="empty-cell">No breakage reports yet</div></div>
            : myBreakages.map((b) => (
              <div key={b.id} className="breakage-card">
                <div className="breakage-card-header">
                  <span className="breakage-card-date">{helpers.fmtDate(b.date)}{b.time ? ` · ${b.time}` : ''}</span>
                </div>
                <div className="breakage-card-reason">{b.reason}</div>
                {b.attachmentUrl && (
                  <a href={b.attachmentUrl} target="_blank" rel="noreferrer" className="breakage-card-img-link">
                    <img src={b.attachmentUrl} alt="breakage" className="breakage-card-img" />
                  </a>
                )}
              </div>
            ))}
        </div>
      </div>
    </section>
  )
}

// ─── Settings (profile + change password) ────────────────────────────────────
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

function SettingsTab({ user, onChangePassword, onSaveProfile }) {
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const [avatarUrl, setAvatarUrl]     = useState(user.avatarUrl || '')
  const [birthday, setBirthday]       = useState(user.birthday || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState('')
  const [profileError, setProfileError]     = useState('')
  const avatarRef = useRef()

  const handlePwSubmit = async () => {
    setPwError('')
    setPwSuccess('')
    if (!form.current) return setPwError('Please enter your current password.')
    if (form.next.length < 6) return setPwError('New password must be at least 6 characters.')
    if (form.next !== form.confirm) return setPwError('New passwords do not match.')
    try {
      await onChangePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setPwSuccess('Password changed successfully.')
    } catch (err) {
      setPwError(err.message || 'Failed to change password.')
    }
  }

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_AVATAR_BYTES) { setProfileError('Image must be under 5 MB.'); return }
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarUrl(ev.target.result)
    reader.readAsDataURL(file)
    setProfileError('')
  }

  const handleSaveProfile = async () => {
    setProfileSaving(true)
    setProfileError('')
    try {
      await onSaveProfile({ avatarUrl: avatarUrl || null, birthday: birthday || null })
      setProfileSuccess('Profile saved!')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch (err) {
      setProfileError(err.message || 'Failed to save profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <section className="settings-section">
      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="section-title">Profile</div>
        <div className="avatar-upload-row">
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" className="avatar-lg" />
            : <div className="avatar-lg-initials">{user.initials}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="ghost-btn" onClick={() => avatarRef.current?.click()}>
              {avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {avatarUrl && (
              <button className="ghost-btn danger-text"
                onClick={() => { setAvatarUrl(''); if (avatarRef.current) avatarRef.current.value = '' }}>
                Remove
              </button>
            )}
            <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarFile} />
          </div>
        </div>
        <label className="field">
          <span>Birthday</span>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
        </label>
        {profileError   && <div className="error-box">{profileError}</div>}
        {profileSuccess && <div className="success-box">{profileSuccess}</div>}
        <button className="primary-btn" onClick={handleSaveProfile} disabled={profileSaving}>
          {profileSaving ? 'Saving…' : 'Save profile'}
        </button>
      </div>

      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="section-title">Change password</div>
        <label className="field"><span>Current password</span>
          <input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </label>
        <label className="field"><span>New password</span>
          <input type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        </label>
        <label className="field"><span>Confirm new password</span>
          <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </label>
        {pwError   && <div className="error-box">{pwError}</div>}
        {pwSuccess && <div className="success-box">{pwSuccess}</div>}
        <button className="primary-btn" onClick={handlePwSubmit}>Change password</button>
      </div>
    </section>
  )
}

// ─── Main StaffPortal ─────────────────────────────────────────────────────────
export default function StaffPortal({ state }) {
  const {
    db, currentUserId, currentUser, helpers,
    clockSession, clockIn, clockOut, breakStart, breakEnd, setRoleOfDay,
    submitLeave, revokeLeave,
    addCalendarEvent, deleteCalendarEvent,
    assignShift, deleteShift,
    submitBreakage,
    changePassword,
    saveStaff,
    logout,
    leaveTypes,
  } = state

  const isTeamLead = currentUser?.role === 'team_lead'

  const TABS = [
    { id: 'clock',    label: 'Clock in/out' },
    { id: 'schedule', label: 'My schedule' },
    { id: 'leave',    label: 'Apply leave' },
    { id: 'history',  label: 'My leaves' },
    { id: 'breakage', label: 'Breakages' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'settings', label: 'Settings' },
  ]

  const [activeTab, setActiveTab] = useState('clock')

  const todayBirthdays = useMemo(() => {
    if (!db) return []
    const today = new Date()
    const mmdd  = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return Object.entries(db.users)
      .filter(([, u]) => u.birthday && String(u.birthday).slice(5, 10) === mmdd)
      .map(([uid, u]) => ({ uid, name: u.name, isMe: uid === currentUserId }))
  }, [db, currentUserId])

  const saveProfile = useCallback((payload) => saveStaff(currentUserId, payload), [saveStaff, currentUserId])

  const pendingApprovals = isTeamLead
    ? helpers.getAllSubordinates(currentUserId)
        .flatMap((uid) => (db.leaves[uid] || []).filter((l) => l.status === 'pending')).length
    : 0

  const tabsWithBadges = TABS.map((t) => ({
    ...t,
    label: t.id === 'leave' && pendingApprovals > 0 ? `${t.label} (${pendingApprovals} pending)` : t.label,
  }))

  return (
    <AppShell user={currentUser} onLogout={logout} tabs={tabsWithBadges} activeTab={activeTab} onTabChange={setActiveTab}>
      {todayBirthdays.length > 0 && (
        <div className="birthday-bar">
          {todayBirthdays.map(({ uid, name, isMe }) => (
            <div key={uid} className="birthday-item">
              🎂 {isMe ? "It's your birthday! Happy birthday!" : `Today is ${name}'s birthday! 🎉`}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'clock' && (
        <ClockTab
          userId={currentUserId} user={currentUser}
          db={db} helpers={helpers}
          clockSession={clockSession}
          onClockIn={clockIn} onClockOut={clockOut}
          onBreakStart={breakStart} onBreakEnd={breakEnd}
          onSetRoleOfDay={setRoleOfDay}
        />
      )}
      {activeTab === 'schedule' && (
        <ScheduleTab
          userId={currentUserId} user={currentUser}
          db={db} helpers={helpers}
          isTeamLead={isTeamLead}
          assignShift={assignShift} deleteShift={deleteShift}
        />
      )}
      {activeTab === 'leave' && (
        <LeaveApplyTab
          userId={currentUserId} db={db} helpers={helpers}
          onSubmitLeave={submitLeave} leaveTypes={leaveTypes}
        />
      )}
      {activeTab === 'history' && (
        <LeaveHistoryTab
          userId={currentUserId} db={db} helpers={helpers}
          onRevokeLeave={revokeLeave}
        />
      )}
      {activeTab === 'breakage' && (
        <BreakageTab
          userId={currentUserId} db={db} helpers={helpers}
          onSubmitBreakage={submitBreakage}
        />
      )}
      {activeTab === 'calendar' && (
        <CalendarView
          db={db} helpers={helpers}
          currentUserId={currentUserId} currentUser={currentUser}
          onAddEvent={addCalendarEvent} onDeleteEvent={deleteCalendarEvent}
        />
      )}
      {activeTab === 'settings' && (
        <SettingsTab
          user={currentUser}
          onChangePassword={changePassword}
          onSaveProfile={saveProfile}
        />
      )}
    </AppShell>
  )
}
