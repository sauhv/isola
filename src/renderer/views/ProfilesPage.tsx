'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Profile } from '../../shared/types'
import type { Page } from '../App'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'
import GroupsTab from './profiles/GroupsTab'
import ProfileFormPage from './profiles/ProfileFormPage'
import ProfilesTab from './profiles/ProfilesTab'
import TrashTab from './profiles/TrashTab'

type Tab = 'profiles' | 'groups' | 'trash'
type FormState = { profile: Profile | null } | null

interface Props {
  newProfileTick: number
  onNavigate: (page: Page) => void
}

export default function ProfilesPage({ newProfileTick, onNavigate }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('profiles')
  const [form, setForm] = useState<FormState>(null)
  // Tăng sau mỗi lần lưu để bảng tải lại.
  const [reloadTick, setReloadTick] = useState(0)
  const [kernelMissing, setKernelMissing] = useState(false)
  const [geoMissing, setGeoMissing] = useState(false)

  // Bấm "Tạo profile" ở sidebar: mở trang tạo profile.
  useEffect(() => {
    if (newProfileTick) {
      setTab('profiles')
      setForm({ profile: null })
    }
  }, [newProfileTick])

  useEffect(() => {
    call(isola().kernels.list())
      .then((ks) => setKernelMissing(!ks.some((k) => k.installed)))
      .catch(() => {})
    call(isola().geo.status())
      .then((g) => setGeoMissing(!g.installed))
      .catch(() => {})
  }, [])

  if (form) {
    return (
      <ProfileFormPage
        key={form.profile?.id ?? 'new'}
        profile={form.profile}
        onClose={() => setForm(null)}
        onSaved={() => {
          setForm(null)
          setReloadTick((t) => t + 1)
        }}
      />
    )
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Profile</h1>
      </div>

      {kernelMissing && (
        <div className="banner">
          <AlertTriangle size={16} />
          <span>{t('pp.kernelBanner')}</span>
          <span className="spacer" />
          <button className="small primary" onClick={() => onNavigate('kernels')}>
            {t('pp.downloadKernel')}
          </button>
        </div>
      )}
      {!kernelMissing && geoMissing && (
        <div className="banner">
          <AlertTriangle size={16} />
          <span>{t('pp.geoBanner')}</span>
          <span className="spacer" />
          <button className="small primary" onClick={() => onNavigate('proxies')}>
            {t('proxies.downloadGeo')}
          </button>
        </div>
      )}

      <div className="panel">
        <div className="tabs">
          <button className={`tab${tab === 'profiles' ? ' active' : ''}`} onClick={() => setTab('profiles')}>
            Profiles
          </button>
          <button className={`tab${tab === 'groups' ? ' active' : ''}`} onClick={() => setTab('groups')}>
            {t('pp.tabGroups')}
          </button>
          <button className={`tab${tab === 'trash' ? ' active' : ''}`} onClick={() => setTab('trash')}>
            {t('pp.tabTrash')}
          </button>
        </div>
        {tab === 'profiles' && (
          <ProfilesTab
            reloadTick={reloadTick}
            onCreate={() => setForm({ profile: null })}
            onEdit={(profile) => setForm({ profile })}
          />
        )}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'trash' && <TrashTab />}
      </div>
    </>
  )
}
