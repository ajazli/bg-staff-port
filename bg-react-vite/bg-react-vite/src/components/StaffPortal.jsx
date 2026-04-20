import { useEffect, useMemo, useState } from 'react'
import Badge from './Badge'

function Stats({ weekHours, annualLeft, presentDays }) {
  return (
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">Hours this week</div><div className="stat-value">{weekHours}</div><div className="stat-sub">Mon–Sun</div></div>
      <div className="stat-card"><div className="stat-label">Annual leave left</div><div className="stat-value">{annualLeft}</div><div className="stat-sub">days remaining</div></div>
      <div className="stat-card"><div className="stat-label">Days present</div><div className="stat-value">{presentDays}</div><div className="stat-sub">this month</div></div>
    </div>
  )
}

export default function StaffPortal({ userId, user, db, helpers, clockSession, onClockIn, onClockOut, onSubmitLeave, onRevokeLeave }) {
  const [activeTab, setActiveTab] = useState('clock')
  const [liveTime, setLiveTime] = useState(new Date())
  const [branchId, setBranchId] = useState(user.branchIds?.[0] || db.branches[0]?.id || '')
  const [leaveForm, setLeaveForm] = useState({ type: 'Annual leave', start: '', end: '', reason: '' })
  const [mcForm, setMcForm] = useState({ start: '', end: '', reason: '', fileName: '' })

  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const attendance = db.attendance[userId] || []
  const leaves = db.leaves[userId] || []
  const balances = db.balances[userId] || {}

  const weekHours = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
    startOfWeek.setHours(0, 0, 0, 0)
    let total = 0
    attendance.forEach((record) => {
      const d = new Date(record.date)
      if (d >= startOfWeek) {
        const match = /(?<h>\d+)h\s(?<m>\d+)m/.exec(record.hours || '')
        if (match) total += Number(match.groups.h) * 60 + Number(match.groups.m)
      }
    })
    return `${Math.floor(total / 60)}h ${total % 60}m`
  }, [attendance])

  const presentDays = useMemo(() => {
    const now = new Date()
    return attendance.filter((record) => {
      const d = new Date(record.date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [attendance])

  const submitLeave = () => {
    if (!leaveForm.start || !leaveForm.end) return
    onSubmitLeave(leaveForm)
    setLeaveForm({ type: 'Annual leave', start: '', end: '', reason: '' })
  }

  const submitMc = () => {
    if (!mcForm.start || !mcForm.end || !mcForm.fileName) return
    onSubmitLeave({ type: 'Medical leave', start: mcForm.start, end: mcForm.end, reason: mcForm.reason || '—', attachmentName: mcForm.fileName })
    setMcForm({ start: '', end: '', reason: '', fileName: '' })
  }

  return (
    <div>
      <div className="subnav">
        {[
          { id: 'clock', label: 'Clock in/out' },
          { id: 'apply', label: 'Apply leave' },
          { id: 'mc', label: 'Submit MC' },
          { id: 'history', label: 'My leaves' },
        ].map((tab) => (
          <button key={tab.id} className={`subnav-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'clock' && (
        <section>
          <Stats weekHours={weekHours} annualLeft={helpers.getBalanceRemaining(userId, 'Annual leave')} presentDays={presentDays} />
          <div className="panel clock-panel">
            <div className="clock-time">{liveTime.toLocaleTimeString('en-SG', { hour12: false })}</div>
            <div className="clock-date">{liveTime.toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div className="status-row">{clockSession.active ? <Badge tone="success">Clocked in — {clockSession.branchName}</Badge> : <Badge>Not clocked in</Badge>}</div>
            {!clockSession.active && (
              <label className="field max-280"><span>Branch</span><select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{helpers.getUserBranches(userId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            )}
            <button className={`primary-btn ${clockSession.active ? 'danger' : ''}`} onClick={() => clockSession.active ? onClockOut() : onClockIn(branchId)}>{clockSession.active ? 'Clock Out' : 'Clock In'}</button>
          </div>
          <div className="section-title">Recent attendance</div>
          <div className="table-card">
            <table>
              <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Branch</th><th>Location</th><th>Status</th></tr></thead>
              <tbody>
                {attendance.length === 0 ? <tr><td colSpan="7" className="empty-cell">No attendance records yet</td></tr> : attendance.slice(0, 10).map((record, idx) => (
                  <tr key={`${record.date}-${idx}`}>
                    <td>{helpers.fmtDate(record.date)}</td>
                    <td>{record.in}</td>
                    <td>{record.out || '—'}</td>
                    <td>{record.hours || '—'}</td>
                    <td>{record.branchName}</td>
                    <td><Badge tone={record.locOk ? 'success' : 'danger'}>{record.locOk ? 'On-site' : 'Flagged'}</Badge></td>
                    <td>
                      <div className="stack-inline"><Badge tone="success">{helpers.cap(record.status)}</Badge>{helpers.getTimingBadges(record).map((text) => <Badge key={text} tone={text.includes('Late') || text.includes('Left early') ? 'warn' : 'info'}>{text}</Badge>)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'apply' && (
        <section className="two-col">
          <div className="panel">
            <div className="section-title">Apply for leave</div>
            <label className="field"><span>Leave type</span><select value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}><option>Annual leave</option><option>PH off in lieu</option><option>Unpaid leave</option></select></label>
            <label className="field"><span>Start date</span><input type="date" value={leaveForm.start} onChange={(e) => setLeaveForm({ ...leaveForm, start: e.target.value })} /></label>
            <label className="field"><span>End date</span><input type="date" value={leaveForm.end} onChange={(e) => setLeaveForm({ ...leaveForm, end: e.target.value })} /></label>
            <label className="field"><span>Reason</span><textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></label>
            <button className="primary-btn" onClick={submitLeave}>Submit application</button>
          </div>
          <div className="panel">
            <div className="section-title">Leave balance</div>
            <div className="balance-grid">
              {Object.entries(balances).filter(([key]) => key !== 'Emergency leave').map(([key, value]) => <div className="balance-card" key={key}><div className="balance-title">{key}</div><div className="balance-value">{value.total - value.used}</div><div className="balance-sub">{value.used} used / {value.total} total</div></div>)}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'mc' && (
        <section className="two-col">
          <div className="panel">
            <div className="section-title">Submit MC</div>
            <label className="field"><span>MC start date</span><input type="date" value={mcForm.start} onChange={(e) => setMcForm({ ...mcForm, start: e.target.value })} /></label>
            <label className="field"><span>MC end date</span><input type="date" value={mcForm.end} onChange={(e) => setMcForm({ ...mcForm, end: e.target.value })} /></label>
            <label className="field"><span>MC notes</span><textarea value={mcForm.reason} onChange={(e) => setMcForm({ ...mcForm, reason: e.target.value })} /></label>
            <label className="field"><span>Attach MC</span><input value={mcForm.fileName} onChange={(e) => setMcForm({ ...mcForm, fileName: e.target.value })} placeholder="mc-letter.pdf" /></label>
            <button className="primary-btn" onClick={submitMc}>Submit MC</button>
          </div>
          <div className="panel"><div className="section-title">MC rules</div><p className="muted-copy">This React version keeps the same MC flow from your HTML app, but now it is component-based and ready to be connected to Supabase or another backend.</p></div>
        </section>
      )}

      {activeTab === 'history' && (
        <section>
          <div className="section-title">My leave history</div>
          <div className="table-card">
            <table>
              <thead><tr><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {leaves.length === 0 ? <tr><td colSpan="7" className="empty-cell">No leave history yet</td></tr> : leaves.map((leave, index) => (
                  <tr key={`${leave.type}-${leave.start}-${index}`}>
                    <td>{leave.type}</td>
                    <td>{helpers.fmtDate(leave.start)}</td>
                    <td>{helpers.fmtDate(leave.end)}</td>
                    <td>{leave.days}</td>
                    <td>{leave.reason}</td>
                    <td><Badge tone={leave.status === 'approved' ? 'success' : leave.status === 'rejected' ? 'danger' : 'info'}>{helpers.cap(leave.status)}</Badge></td>
                    <td>{leave.status === 'pending' ? <button className="ghost-btn" onClick={() => onRevokeLeave(index)}>Revoke</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
