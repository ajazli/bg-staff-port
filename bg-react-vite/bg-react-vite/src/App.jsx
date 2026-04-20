import { useState } from 'react'
import AdminPortal from './components/AdminPortal'
import LoginScreen from './components/LoginScreen'
import SetupScreen from './components/SetupScreen'
import StaffPortal from './components/StaffPortal'
import { usePortalState } from './hooks/usePortalState'

export default function App() {
  const state = usePortalState()
  const { loading, currentUserId, currentUser, login, setupPassword } = state

  const [setupUserId, setSetupUserId] = useState(null)

  if (loading) {
    return (
      <div className="screen-shell center">
        <div className="loading-wrap">
          <div className="brand-icon" style={{ marginBottom: 16 }}>BG</div>
          <div className="loading-text">Loading…</div>
        </div>
      </div>
    )
  }

  const handleLogin = async (username, password) => {
    const result = await login(username, password)
    if (result.setupRequired) setSetupUserId(result.userId)
    return result
  }

  if (setupUserId && !currentUserId) {
    return (
      <SetupScreen
        userId={setupUserId}
        onSave={(uid, pw) => { setupPassword(uid, pw); setSetupUserId(null) }}
      />
    )
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />

  if (currentUser.role === 'admin') return <AdminPortal state={state} />
  return <StaffPortal state={state} />
}
