'use client'

import { ChevronLeft, ChevronRight, Cpu, Globe, LayoutList, Plus, Puzzle } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { call, isola } from './lib/isola'
import ExtensionsPage from './views/ExtensionsPage'
import KernelsPage from './views/KernelsPage'
import ProfilesPage from './views/ProfilesPage'
import ProxiesPage from './views/ProxiesPage'

// Các màn nằm trong src/renderer/views (không dùng tên `pages` vì Next.js coi đó là Pages Router).
export type Page = 'profiles' | 'proxies' | 'extensions' | 'kernels'

const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'profiles', label: 'Profile', icon: <LayoutList size={18} /> },
  { id: 'proxies', label: 'Proxy', icon: <Globe size={18} /> },
  { id: 'extensions', label: 'Extension', icon: <Puzzle size={18} /> }
]

export default function App() {
  const [page, setPage] = useState<Page>('profiles')
  const [collapsed, setCollapsed] = useState(false)
  // Tăng mỗi lần bấm "Tạo profile" ở sidebar để màn Profile mở form.
  const [newProfileTick, setNewProfileTick] = useState(0)
  const [stats, setStats] = useState({ total: 0, running: 0 })

  const refreshStats = useCallback(() => {
    call(isola().profiles.list())
      .then((list) => setStats({ total: list.length, running: list.filter((p) => p.status === 'running').length }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshStats()
    return isola().onProfileStatus(refreshStats)
  }, [refreshStats])

  const navItem = (id: Page, label: string, icon: ReactNode) => (
    <button
      key={id}
      className={`nav-item${page === id ? ' active' : ''}`}
      onClick={() => setPage(id)}
      title={collapsed ? label : undefined}
    >
      {icon}
      <span className="label">{label}</span>
    </button>
  )

  return (
    <div className="shell">
      <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">I</div>
          <span className="label">Isola</span>
        </div>
        <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Mở rộng' : 'Thu gọn'}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <button
          className="primary new-profile-btn"
          title="Tạo profile"
          onClick={() => {
            setPage('profiles')
            setNewProfileTick((t) => t + 1)
          }}
        >
          <Plus size={18} />
          <span className="label">Tạo profile</span>
        </button>

        {NAV.map((n) => navItem(n.id, n.label, n.icon))}

        <div className="nav-section">Hệ thống</div>
        {navItem('kernels', 'Kernel', <Cpu size={18} />)}

        <div className="sidebar-foot">
          <div className="row">
            <span>Profile</span>
            <span>{stats.total}</span>
          </div>
          <div className="row">
            <span>Đang chạy</span>
            <span style={{ color: stats.running ? 'var(--ok)' : undefined }}>{stats.running}</span>
          </div>
          <div className="row">
            <span>Chế độ fingerprint</span>
            <span className="tag" style={{ margin: 0 }}>
              compat
            </span>
          </div>
        </div>
      </nav>

      <main className="main">
        {page === 'profiles' && <ProfilesPage newProfileTick={newProfileTick} onNavigate={setPage} />}
        {page === 'proxies' && <ProxiesPage />}
        {page === 'extensions' && <ExtensionsPage />}
        {page === 'kernels' && <KernelsPage />}
      </main>
    </div>
  )
}
