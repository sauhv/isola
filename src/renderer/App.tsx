'use client'

import { useState } from 'react'
import KernelsPage from './views/KernelsPage'
import ProfilesPage from './views/ProfilesPage'

// Các màn nằm trong src/renderer/views (không dùng tên `pages` vì Next.js coi đó là Pages Router).
type Page = 'profiles' | 'kernels'

const NAV: { id: Page; label: string }[] = [
  { id: 'profiles', label: 'Profile' },
  { id: 'kernels', label: 'Kernel' }
]

export default function App() {
  const [page, setPage] = useState<Page>('profiles')
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">Isola</div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item${page === n.id ? ' active' : ''}`} onClick={() => setPage(n.id)}>
            {n.label}
          </button>
        ))}
      </nav>
      <main className="main">{page === 'profiles' ? <ProfilesPage /> : <KernelsPage />}</main>
    </div>
  )
}
