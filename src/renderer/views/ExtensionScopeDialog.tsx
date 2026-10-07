'use client'

import { useState } from 'react'
import type { Extension, ExtensionScope, Group, Profile } from '../../shared/types'
import { call, isola } from '../lib/isola'

interface Props {
  extension: Extension
  groups: Group[]
  profiles: Profile[]
  onClose: () => void
  onSaved: () => void
}

export default function ExtensionScopeDialog({ extension, groups, profiles, onClose, onSaved }: Props) {
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
        <h2>Áp dụng "{extension.name}" cho</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <label className="checkbox">
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
            Tất cả profile
          </label>
          <label className="checkbox">
            <input type="radio" checked={scope === 'groups'} onChange={() => setScope('groups')} />
            Theo nhóm
          </label>
          {scope === 'groups' && (
            <div className="pick-list">
              {groups.length === 0 && <div className="muted">Chưa có nhóm nào.</div>}
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
            Chọn từng profile
          </label>
          {scope === 'profiles' && (
            <>
              <input placeholder="Tìm profile" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="pick-list">
                {shownProfiles.length === 0 && <div className="muted">Không có profile.</div>}
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
              <span className="hint">Đã chọn {profileIds.size} profile.</span>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>Hủy</button>
          <button className="primary" disabled={saving} onClick={save}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
