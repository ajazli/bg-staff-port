import { useState } from 'react'
import AppShell from './components/AppShell'
import AdminPortal from './components/AdminPortal'
import LoginScreen from './components/LoginScreen'
import SetupScreen from './components/SetupScreen'
import StaffPortal from './components/StaffPortal'
import { usePortalState } from './hooks/usePortalState'

export default function App() {
  const state = usePortalState()
  const { currentUserId, currentUser, login, setupPassword } = state

  const [setupUserId, setSetupUserId] = useState(null)

  const handleLogin = (username, password) => {
    const result = login(username, password)
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

  if (currentUser.role === 'admin') {
    return <AdminPortal state={state} />
  }

  return <StaffPortal state={state} />
}
