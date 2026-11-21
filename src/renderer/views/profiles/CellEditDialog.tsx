'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Profile, Proxy } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'

export type CellField = 'name' | 'proxy' | 'notes' | 'tags'

interface Props {
  profile: Profile
  field: CellField
  onClose: () => void
  onDone: (message: string | null) => void
}

const splitTags = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

export default function CellEditDialog({ profile, field, onClose, onDone }: Props) {
  const { t } = useI18n()
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [name, setName] = useState(profile.name)
  const [notes, setNotes] = useState(profile.notes ?? '')
  const [tags, setTags] = useState(profile.tags.map((x) => x.name).join(', '))
  const [proxyId, setProxyId] = useState(profile.proxyId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const running = profile.status === 'running'

  useEffect(() => {
    if (field === 'proxy') call(isola().proxies.list()).then(setProxies).catch((e) => setError(e.message))
  }, [field])

  const title =
    field === 'name' ? t('common.name') : field === 'proxy' ? t('qe.editProxy') : field === 'notes' ? t('qe.editRemark') : 'Tags'

  async function save() {
    setError(null)
    if (field === 'proxy' && running) return setError(t('qe.runningProxy'))
    if (field === 'name' && !name.trim()) return setError(t('pf.errName'))
    setSaving(true)
    try {
      const patch =
        field === 'name'
          ? { name: name.trim() }
          : field === 'notes'
            ? { notes: notes.trim() || null }
            : field === 'tags'
              ? { tags: splitTags(tags) }
              : { proxyId: proxyId || null, lab: proxyId ? false : true }
      await call(isola().profiles.update(profile.id, patch))
      onDone(t('qe.saved'))
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(520px, calc(100vw - 32px))' }}>
        <h2>
          {title} · #{profile.serial}
        </h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          {field === 'name' && (
            <label className="field">
              <span>{t('common.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            </label>
          )}
          {field === 'proxy' && (
            <label className="field">
              <span>Proxy</span>
              <select value={proxyId} onChange={(e) => setProxyId(e.target.value)} disabled={running} autoFocus>
                <option value="">{t('qe.proxyNone')}</option>
                {proxies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.type}
                    {p.lastCheck && !p.lastCheck.error ? ` · ${p.lastCheck.ip ?? ''} ${p.lastCheck.country ?? ''}` : ''}
                  </option>
                ))}
              </select>
              {running && <span className="hint">{t('qe.runningProxy')}</span>}
            </label>
          )}
          {field === 'tags' && (
            <label className="field">
              <span>Tags</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('pf.tagsPh')} autoFocus />
            </label>
          )}
          {field === 'notes' && (
            <label className="field">
              <span>{t('pf.notes')}</span>
              <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus />
            </label>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" disabled={saving} onClick={save}>
            {saving && <Loader2 size={14} className="spin" />} OK
          </button>
        </div>
      </div>
    </div>
  )
}
