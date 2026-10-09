'use client'

import { useState } from 'react'
import type { Extension, ExtensionScope, Group, Profile } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'

interface Props {
  extension: Extension
  groups: Group[]
  profiles: Profile[]
  onClose: () => void
  onSaved: () => void
}

export default function ExtensionScopeDialog({ extension, groups, profiles, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [scope, setScope] = useState<ExtensionScope>(extension.scope)
  const [groupIds, setGroupIds] = useState(new Set(extension.groupIds))
  const [profileIds, setProfileIds] = useState(new Set(extension.profileIds))
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setter(next)
  }

  const shownProfiles = profiles.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await call(isola().extensions.update(extension.id, { scope, groupIds: [...groupIds], profileIds: [...profileIds] }))
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>{t('extscope.title', { name: extension.name })}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <label className="checkbox">
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            {t('extscope.all')}
          </label>
          <label className="checkbox">
            <input type="radio" checked={scope === 'groups'} onChange={() => setScope('groups')} />
            {t('extscope.byGroup')}
          </label>
          {scope === 'groups' && (
            <div className="pick-list">
              {groups.length === 0 && <div className="muted">{t('extscope.noGroup')}</div>}
              {groups.map((g) => (
                <label key={g.id} className="checkbox">
                  <input type="checkbox" checked={groupIds.has(g.id)} onChange={() => toggle(groupIds, setGroupIds, g.id)} />
                  {g.name} <span className="muted">({g.profileCount})</span>
                </label>
              ))}
            </div>
          )}
          <label className="checkbox">
            <input type="radio" checked={scope === 'profiles'} onChange={() => setScope('profiles')} />
            {t('extscope.byProfile')}
          </label>
          {scope === 'profiles' && (
            <>
              <input placeholder={t('extscope.findProfile')} value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="pick-list">
                {shownProfiles.length === 0 && <div className="muted">{t('extscope.noProfile')}</div>}
                {shownProfiles.map((p) => (
                  <label key={p.id} className="checkbox">
                    <input
                      type="checkbox"
                      checked={profileIds.has(p.id)}
                      onChange={() => toggle(profileIds, setProfileIds, p.id)}
                    />
                    <span className="muted">#{p.serial}</span> {p.name}
                    {p.groupName && <span className="muted"> · {p.groupName}</span>}
                  </label>
                ))}
              </div>
              <span className="hint">{t('extscope.selectedN', { n: profileIds.size })}</span>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" disabled={saving} onClick={save}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
