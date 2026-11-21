'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { Group, Profile } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'

interface Props {
  source: Profile
  groups: Group[]
  onClose: () => void
  onDone: (message: string | null) => void
}

export default function CloneDialog({ source, groups, onClose, onDone }: Props) {
  const { t } = useI18n()
  const [count, setCount] = useState('1')
  // '' = giữ group nguồn; '__none' = không group; còn lại = id group.
  const [groupSel, setGroupSel] = useState('')
  const [copyName, setCopyName] = useState(false)
  const [copyCookies, setCopyCookies] = useState(false)
  const [copyProxy, setCopyProxy] = useState(!!source.proxyId)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const n = Math.min(500, Math.max(1, Number(count) || 1))

  async function run() {
    setSaving(true)
    setError(null)
    try {
      const created = await call(
        isola().profiles.clone(source.id, {
          count: n,
          groupId: groupSel === '' ? undefined : groupSel === '__none' ? null : groupSel,
          copyName,
          copyCookies,
          copyProxy
        })
      )
      onDone(t('clone.done', { n: created.length }))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(480px, calc(100vw - 32px))' }}>
        <h2>{t('clone.title', { name: source.name })}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <div className="form-row">
            <label className="field" style={{ width: 120 }}>
              <span>{t('clone.count')}</span>
              <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>{t('common.group')}</span>
              <select value={groupSel} onChange={(e) => setGroupSel(e.target.value)}>
                <option value="">{t('clone.keepGroup')}</option>
                <option value="__none">{t('common.noGroup')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={copyName} onChange={(e) => setCopyName(e.target.checked)} />
            {t('clone.copyName')}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={copyProxy} onChange={(e) => setCopyProxy(e.target.checked)} />
            {t('clone.copyProxy')}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={copyCookies} onChange={(e) => setCopyCookies(e.target.checked)} />
            {t('clone.copyCookies')}
          </label>
          <div className="hint">{t('clone.note')}</div>
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" disabled={saving} onClick={run}>
            {saving && <Loader2 size={14} className="spin" />} {t('clone.action', { n })}
          </button>
        </div>
      </div>
    </div>
  )
}
