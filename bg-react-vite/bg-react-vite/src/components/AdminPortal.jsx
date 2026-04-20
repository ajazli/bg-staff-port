import { useMemo, useState } from 'react'
import Badge from './Badge'

export default function AdminPortal({ db, helpers, actLeave, saveStaff, addUser }) {
  const [activeTab, setActiveTab] = useState('leaves')
  const [selectedUserId, setSelectedUserId] = useState('alice')
  const [newUser, setNewUser] = useState({ name: '', username: '', role: 'staff', branchIds: [] })

  const allLeaves = useMemo(() => Object.entries(db.leaves).flatMap(([uid, records]) => records.map((record, idx) => ({ ...record, uid, idx }))), [db.leaves])
  const allAttendance = useMemo(() => Object.entries(db.attendance).flatMap(([uid, records]) => records.map((record, idx) => ({ ...record, uid, idx }))), [db.attendance])
  const selectedUser = db.users[selectedUserId]
  const selectedAttendance = db.attendance[selectedUserId] || []
  const selectedLeaves = db.leaves[selectedUserId] || []

  const lateAlerts = allAttendance.filter((record) => (record.lateMinutes || 0) >= 15)

  const handleSaveStaff = (uid, patch) => {
    saveStaff(uid, patch)
  }

  const handleCreateUser = () => {
    if (!newUser.name || !newUser.username) return
    addUser({ ...newUser, username: newUser.username.toLowerCase().replace(/\s+/g, '') })
    setNewUser({ name: '', username: '', role: 'staff', branchIds: [] })
  }

  return (
    <div>
      {lateAlerts.length > 0 && (
        <div className="alert-card">
          <div className="section-title">Admin alert: 15+ minute late clock-ins</div>
          <div className="alert-list">{lateAlerts.slice(0, 6).map((record, idx) => <div className="alert-item" key={`${record.uid}-${idx}`}><strong>{db.users[record.uid]?.name}</strong> was late by {record.lateMinutes} min on {helpers.fmtDate(record.date)} at {record.branchName}.</div>)}</div>
        </div>
      )}

      <div className="subnav">
        {[
          { id: 'leaves', label: 'Leave requests' },
          { id: 'attendance', label: 'Attendance' },
          { id: 'staff', label: 'Manage staff' },
          { id: 'adduser', label: 'Add user' },
        ].map((tab) => <button key={tab.id} className={`subnav-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>

      {activeTab === 'leaves' && (
        <div className="table-card">
          <table>
            <thead><tr><th>Staff</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {allLeaves.map((record) => (
                <tr key={`${record.uid}-${record.idx}`}>
                  <td>{db.users[record.uid]?.name}</td>
                  <td>{record.type}</td>
                  <td>{helpers.fmtDate(record.start)}</td>
                  <td>{helpers.fmtDate(record.end)}</td>
                  <td>{record.days}</td>
                  <td><Badge tone={record.status === 'approved' ? 'success' : record.status === 'rejected' ? 'danger' : 'info'}>{helpers.cap(record.status)}</Badge></td>
                  <td>{record.status === 'pending' ? <div className="stack-inline"><button className="ghost-btn" onClick={() => actLeave(record.uid, record.idx, 'approved')}>Approve</button><button className="ghost-btn danger-text" onClick={() => actLeave(record.uid, record.idx, 'rejected')}>Reject</button></div> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="table-card">
          <table>
            <thead><tr><th>Staff</th><th>Date</th><th>Expected</th><th>In</th><th>Out</th><th>Hours</th><th>Branch</th><th>Timing</th></tr></thead>
            <tbody>
              {allAttendance.map((record) => (
                <tr key={`${record.uid}-${record.idx}`}>
                  <td>{db.users[record.uid]?.name}</td>
                  <td>{helpers.fmtDate(record.date)}</td>
                  <td>{record.expectedStart || '—'} / {record.expectedEnd || '—'}</td>
                  <td>{record.in}</td>
                  <td>{record.out}</td>
                  <td>{record.hours}</td>
                  <td>{record.branchName}</td>
                  <td><div className="stack-inline">{helpers.getTimingBadges(record).map((text) => <Badge key={text} tone={text.includes('Late') || text.includes('Left early') ? 'warn' : 'info'}>{text}</Badge>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="two-col admin-layout">
          <div className="table-card">
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Start</th><th>End</th><th>Save</th></tr></thead>
              <tbody>
                {Object.entries(db.users).map(([uid, user]) => (
                  <tr key={uid}>
                    <td><button className="link-btn" onClick={() => setSelectedUserId(uid)}>{user.name}</button></td>
                    <td>{helpers.cap(user.role)}</td>
                    <td><input className="inline-input" type="time" defaultValue={user.expectedStart} onBlur={(e) => handleSaveStaff(uid, { expectedStart: e.target.value })} disabled={uid === 'admin'} /></td>
                    <td><input className="inline-input" type="time" defaultValue={user.expectedEnd} onBlur={(e) => handleSaveStaff(uid, { expectedEnd: e.target.value })} disabled={uid === 'admin'} /></td>
                    <td><button className="ghost-btn" onClick={() => handleSaveStaff(uid, {})}>Saved</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="section-title">{selectedUser?.name}</div>
            <p className="muted-copy">Role: {helpers.cap(selectedUser?.role || '')}</p>
            <p className="muted-copy">Branches: {helpers.getUserBranches(selectedUserId).map((branch) => branch.name).join(', ') || '—'}</p>
            <div className="mini-grid">
              <div className="mini-card"><span>Annual leave left</span><strong>{helpers.getBalanceRemaining(selectedUserId, 'Annual leave')}</strong></div>
              <div className="mini-card"><span>PH off in lieu left</span><strong>{helpers.getBalanceRemaining(selectedUserId, 'PH off in lieu')}</strong></div>
              <div className="mini-card"><span>Late shifts</span><strong>{selectedAttendance.filter((record) => record.isLate).length}</strong></div>
              <div className="mini-card"><span>Early leaves</span><strong>{selectedAttendance.filter((record) => record.leftEarly).length}</strong></div>
            </div>
            <div className="section-title">Recent attendance</div>
            <div className="table-card compact">
              <table>
                <thead><tr><th>Date</th><th>Expected</th><th>In</th><th>Out</th></tr></thead>
                <tbody>{selectedAttendance.slice(0, 8).map((record, idx) => <tr key={idx}><td>{helpers.fmtDate(record.date)}</td><td>{record.expectedStart || '—'} / {record.expectedEnd || '—'}</td><td>{record.in}</td><td>{record.out}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="section-title">Leave history</div>
            <div className="table-card compact">
              <table>
                <thead><tr><th>Type</th><th>Start</th><th>Status</th></tr></thead>
                <tbody>{selectedLeaves.map((record, idx) => <tr key={idx}><td>{record.type}</td><td>{helpers.fmtDate(record.start)}</td><td>{record.status}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'adduser' && (
        <div className="two-col">
          <div className="panel max-460">
            <div className="section-title">Add new team member</div>
            <label className="field"><span>Full name</span><input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
            <label className="field"><span>Username</span><input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} /></label>
            <label className="field"><span>Role</span><select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
            <div className="field"><span>Assigned branches</span><div className="check-grid">{db.branches.map((branch) => <label className="check-chip" key={branch.id}><input type="checkbox" checked={newUser.branchIds.includes(branch.id)} onChange={() => setNewUser((prev) => ({ ...prev, branchIds: prev.branchIds.includes(branch.id) ? prev.branchIds.filter((id) => id !== branch.id) : [...prev.branchIds, branch.id] }))} /> {branch.name}</label>)}</div></div>
            <button className="primary-btn" onClick={handleCreateUser}>Create account</button>
          </div>
          <div className="table-card">
            <table>
              <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Branches</th></tr></thead>
              <tbody>{Object.entries(db.users).map(([uid, user]) => <tr key={uid}><td>{user.name}</td><td>{uid}</td><td>{user.role}</td><td>{helpers.getUserBranches(uid).map((branch) => branch.name).join(', ') || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
