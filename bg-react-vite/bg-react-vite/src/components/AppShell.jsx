import Badge from './Badge'

export default function AppShell({ user, tabs, activeTab, onTabChange, onLogout, children }) {
  return (
    <div>
      <header className="topbar">
        <div className="brand-row">
          <div className="brand-mini">BG</div>
          <div className="topbar-title">Breakfast Grill</div>
        </div>
        <div className="topbar-right">
          <div className="avatar">{user.initials}</div>
          <div className="user-short">{user.name.split(' ')[0]}</div>
          {user.role === 'admin' && <Badge tone="info">Admin</Badge>}
          <button className="ghost-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      <nav className="main-nav">
        {tabs.map((tab) => (
          <button key={tab.id} className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => onTabChange(tab.id)}>{tab.label}</button>
        ))}
      </nav>
      <main className="content">{children}</main>
    </div>
  )
}
