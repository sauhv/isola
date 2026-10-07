'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Page } from '../App'
import { call, isola } from '../lib/isola'
import GroupsTab from './profiles/GroupsTab'
import ProfilesTab from './profiles/ProfilesTab'
import TrashTab from './profiles/TrashTab'

type Tab = 'profiles' | 'groups' | 'trash'

interface Props {
  newProfileTick: number
  onNavigate: (page: Page) => void
}

export default function ProfilesPage({ newProfileTick, onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('profiles')
  const [kernelMissing, setKernelMissing] = useState(false)
  const [geoMissing, setGeoMissing] = useState(false)

  // Bấm "Tạo profile" ở sidebar thì luôn quay về tab Profiles.
  useEffect(() => {
    if (newProfileTick) setTab('profiles')
  }, [newProfileTick])

  useEffect(() => {
    call(isola().kernels.list())
      .then((ks) => setKernelMissing(!ks.some((k) => k.installed)))
      .catch(() => {})
    call(isola().geo.status())
      .then((g) => setGeoMissing(!g.installed))
      .catch(() => {})
  }, [])

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Profile</h1>
      </div>

      {kernelMissing && (
        <div className="banner">
          <AlertTriangle size={16} />
          <span>Chưa tải kernel Chrome nên chưa mở được profile nào.</span>
          <span className="spacer" />
          <button className="small primary" onClick={() => onNavigate('kernels')}>
            Tải kernel
          </button>
        </div>
      )}
      {!kernelMissing && geoMissing && (
        <div className="banner">
          <AlertTriangle size={16} />
          <span>Chưa có dữ liệu GeoIP: profile production cần biết timezone của proxy mới mở được.</span>
          <span className="spacer" />
          <button className="small primary" onClick={() => onNavigate('proxies')}>
            Tải GeoIP
          </button>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          <button className={`tab${tab === 'profiles' ? ' active' : ''}`} onClick={() => setTab('profiles')}>
            Profiles
          </button>
          <button className={`tab${tab === 'groups' ? ' active' : ''}`} onClick={() => setTab('groups')}>
            Nhóm
          </button>
          <button className={`tab${tab === 'trash' ? ' active' : ''}`} onClick={() => setTab('trash')}>
            Thùng rác
          </button>
        </div>
        {tab === 'profiles' && <ProfilesTab newProfileTick={newProfileTick} />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'trash' && <TrashTab />}
      </div>
    </>
  )
}
