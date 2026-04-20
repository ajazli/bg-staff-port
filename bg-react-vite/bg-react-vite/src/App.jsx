import { useMemo, useState } from 'react'
import AppShell from './components/AppShell'
import AdminPortal from './components/AdminPortal'
import LoginScreen from './components/LoginScreen'
import SetupScreen from './components/SetupScreen'
import StaffPortal from './components/StaffPortal'
import { usePortalState } from './hooks/usePortalState'

export default function App() {
  const {
    db,
    currentUserId,
    currentUser,
    clockSession,
    helpers,
    login,
    setupPassword,
    logout,
    clockIn,
    clockOut,
    submitLeave,
    revokeLeave,
    actLeave,
    saveStaff,
    addUser,
  } = usePortalState()

  const [setupUserId, setSetupUserId] = useState(null)

  const handleLogin = (username, password) => {
    const result = login(username, password)
    if (result.setupRequired) setSetupUserId(result.userId)
    return result
  }

  const tabs = useMemo(() => {
    if (!currentUser) return []
    return currentUser.role === 'admin' ? [{ id: 'admin', label: 'Admin panel' }] : [{ id: 'staff', label: 'Staff portal' }]
  }, [currentUser])

  if (setupUserId && !currentUserId) {
    return <SetupScreen userId={setupUserId} onSave={(uid, pw) => { setupPassword(uid, pw); setSetupUserId(null) }} />
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />

  return (
    <AppShell user={currentUser} tabs={tabs} activeTab={tabs[0]?.id} onTabChange={() => {}} onLogout={logout}>
      {currentUser.role === 'admin' ? (
        <AdminPortal db={db} helpers={helpers} actLeave={actLeave} saveStaff={saveStaff} addUser={addUser} />
      ) : (
        <StaffPortal
          userId={currentUserId}
          user={currentUser}
          db={db}
          helpers={helpers}
          clockSession={clockSession}
          onClockIn={clockIn}
          onClockOut={clockOut}
          onSubmitLeave={submitLeave}
          onRevokeLeave={revokeLeave}
        />
      )}
    </AppShell>
  )
}
