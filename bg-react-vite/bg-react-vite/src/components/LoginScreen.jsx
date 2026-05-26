import { useState } from 'react'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const result = await onLogin(username, password)
      if (!result.ok) setError(result.error || 'Login failed.')
    } catch {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen-shell center">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="brand-stack">
          <img src="/bg-logo.png" alt="BG" className="brand-icon" />
          <div className="brand-name">Breakfast Grill</div>
          <div className="brand-tag">Staff Portal</div>
        </div>
        <p className="auth-sub">Sign in to your account</p>
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" disabled={loading} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" disabled={loading} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
