import { useState } from 'react'
import Badge from './Badge'
import Modal from './Modal'

export default function AppShell({ user, tabs, activeTab, onTabChange, onLogout, onChangePassword, children }) {
  const [pwModal, setPwModal] = useState(false)
  const [form, setForm]       = useState({ current: '', next: '', confirm: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const openPwModal = () => {
    if (!onChangePassword) return
    setForm({ current: '', next: '', confirm: '' })
    setError('')
    setSuccess('')
    setPwModal(true)
  }

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
    <div>
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mini">BG</div>
          <div className="topbar-title">Breakfast Grill</div>
        </div>
        <div className="topbar-right">
          <button
            className={`user-identity-btn${onChangePassword ? ' user-identity-btn--interactive' : ''}`}
            onClick={openPwModal}
            title={onChangePassword ? 'Change password' : undefined}
            disabled={!onChangePassword}
          >
            <div className="avatar">{user.initials}</div>
            <span className="user-short">{user.name.split(' ')[0]}</span>
          </button>
          {user.role === 'admin'     && <Badge tone="info">Admin</Badge>}
          {user.role === 'team_lead' && <Badge tone="info">Team Lead</Badge>}
          <button className="ghost-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      <nav className="main-nav">
        {(tabs || []).map((tab) => (
          <button
            key={tab.id}
            className={`nav-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="content">{children}</main>

      {pwModal && (
        <Modal title="Change password" onClose={() => setPwModal(false)}>
          <label className="field"><span>Current password</span>
            <input type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} autoFocus />
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
        </Modal>
      )}
    </div>
  )
}
