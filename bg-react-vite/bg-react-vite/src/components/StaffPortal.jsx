import { useEffect, useMemo, useRef, useState } from 'react'
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
function ClockTab({ userId, user, db, helpers, clockSession, onClockIn, onClockOut, onBreakStart, onBreakEnd }) {
  const [liveTime, setLiveTime]     = useState(new Date())
  const [branchId, setBranchId]     = useState(user.branchIds?.[0] || db.branches[0]?.id || '')
  const [gpsStatus, setGpsStatus]   = useState('')  // 'checking' | 'ok' | error string
  const [phNotice, setPhNotice]     = useState('')

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
    const branch = helpers.getBranch(branchId)
    if (!branch) return
    if (!branch.lat || !branch.lng) {
      onClockIn(branchId, { locOk: false })
      return
    }
    setGpsStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, branch.lat, branch.lng)
        if (dist <= branch.radius) {
          setGpsStatus('ok')
          onClockIn(branchId, { locOk: true })
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

  const handleClockOut = () => {
    const result = onClockOut()
    if (result.phCredited) setPhNotice(`You worked on ${result.phName}. One PH Off-in-Lieu day has been credited.`)
  }

  const todayShift = helpers.getTodayShift(userId)
  const todayBranch = todayShift ? helpers.getBranch(todayShift.branchId) : null

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
        {phNotice && <div className="info-panel">{phNotice}</div>}

        <button
          className={`primary-btn${clockSession.active ? ' danger' : ''}`}
          onClick={clockSession.active ? handleClockOut : handleClockIn}
          disabled={gpsStatus === 'checking'}
        >
          {clockSession.active ? 'Clock Out' : 'Clock In'}
        </button>

        {clockSession.active && (
          <div className="break-section">
            {clockSession.onBreak ? (
              <>
                <div className="break-status">
                  <Badge tone="warn">On break{clockSession.breakStartedAt ? ` since ${new Date(clockSession.breakStartedAt).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}</Badge>
                </div>
                <button className="primary-btn break-end-btn" onClick={onBreakEnd}>End Break</button>
              </>
            ) : (
              <button className="ghost-btn break-start-btn" onClick={onBreakStart}>Start Break</button>
            )}
          </div>
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

  const leaveType = leaveTypes.find((t) => t.id === form.type)
  const needsFile = leaveType?.requiresFile || false
  const balances  = db.balances[userId] || {}

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
            {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.label || t.name}{t.requiresFile ? ' *' : ''}</option>)}
          </select>
        </label>
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
        <div className="section-title">Leave balances</div>
        <div className="balance-grid">
          {leaveTypes.map((lt) => {
            const bal = balances[lt.id] || { total: 0, used: 0 }
            const rem = bal.total - bal.used
            const isUnlimited = lt.defaultDays === 0
            return (
              <div className="balance-card" key={lt.id} style={{ borderTop: `3px solid ${lt.color}` }}>
                <div className="balance-title" style={{ color: lt.color }}>{lt.label || lt.name}</div>
                {isUnlimited
                  ? <div className="balance-value">—</div>
                  : <div className="balance-value" style={{ color: lt.color }}>{rem}</div>}
                <div className="balance-sub">
                  {isUnlimited ? `${bal.used} days taken` : `${bal.used} used / ${bal.total} total`}
                </div>
              </div>
            )
          })}
        </div>
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

// ─── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordTab({ onChangePassword }) {
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!form.current) return setError('Please enter your current password.')
    if (form.next.length < 6) return setError('New password must be at least 6 characters.')
    if (form.next !== form.confirm) return setError('New passwords do not match.')
    try {
      await onChangePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setSuccess('Password changed successfully.')
    } catch (err) {
      setError(err.message || 'Failed to change password.')
    }
  }

  return (
    <section>
      <div className="panel" style={{ maxWidth: 400 }}>
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
        {error   && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}
        <button className="primary-btn" onClick={handleSubmit}>Change password</button>
      </div>
    </section>
  )
}

// ─── Main StaffPortal ─────────────────────────────────────────────────────────
export default function StaffPortal({ state }) {
  const {
    db, currentUserId, currentUser, helpers,
    clockSession, clockIn, clockOut, breakStart, breakEnd,
    submitLeave, revokeLeave,
    addCalendarEvent, deleteCalendarEvent,
    assignShift, deleteShift,
    submitBreakage,
    changePassword,
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
    { id: 'password', label: 'Change password' },
  ]

  const [activeTab, setActiveTab] = useState('clock')

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
      {activeTab === 'clock' && (
        <ClockTab
          userId={currentUserId} user={currentUser}
          db={db} helpers={helpers}
          clockSession={clockSession}
          onClockIn={clockIn} onClockOut={clockOut}
          onBreakStart={breakStart} onBreakEnd={breakEnd}
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
      {activeTab === 'password' && (
        <ChangePasswordTab onChangePassword={changePassword} />
      )}
    </AppShell>
  )
}
