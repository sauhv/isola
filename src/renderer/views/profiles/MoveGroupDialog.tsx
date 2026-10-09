'use client'

import { useState } from 'react'
import type { Group, Profile } from '../../../shared/types'
import { runBatch } from '../../lib/batch'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'

interface Props {
  profiles: Profile[]
  groups: Group[]
  onClose: () => void
  /** err: tóm tắt lỗi nếu có profile không chuyển được. */
  onDone: (err: string | null) => void
}

export default function MoveGroupDialog({ profiles, groups, onClose, onDone }: Props) {
  const { t } = useI18n()
  const [groupId, setGroupId] = useState(profiles.length === 1 ? (profiles[0].groupId ?? '') : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const err = await runBatch(
      profiles,
      (p) => p.name,
      (p) => call(isola().profiles.update(p.id, { groupId: groupId || null }))
    )
    onDone(err)
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 420 }}>
        <h2>{profiles.length === 1 ? t('move.titleOne', { name: profiles[0].name }) : t('move.titleN', { n: profiles.length })}</h2>
        <label className="field">
          <span>{t('move.target')}</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} autoFocus>
            <option value="">{t('common.noGroup')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <div className="dialog-actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" disabled={saving} onClick={save}>
            {t('move.action')}
          </button>
        </div>
      </div>
    </div>
  )
}
