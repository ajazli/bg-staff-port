import { useState } from 'react'

export default function SetupScreen({ userId, onSave }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    if (pw1.length < 6) return setError('Password must be at least 6 characters.')
    if (pw1 !== pw2) return setError('Passwords do not match.')
    onSave(userId, pw1)
  }

  return (
    <div className="screen-shell center">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand-stack">
          <div className="brand-icon">BG</div>
          <div className="brand-name">Breakfast Grill</div>
        </div>
        <h2 className="setup-title">Welcome to the team!</h2>
        <p className="auth-sub">First login — create your own password to continue.</p>
        <div className="info-panel">Signing in as <strong>{userId}</strong></div>
        <label className="field"><span>New password</span><input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} /></label>
        <label className="field"><span>Confirm password</span><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-btn" type="submit">Set password &amp; enter portal</button>
      </form>
    </div>
  )
}
