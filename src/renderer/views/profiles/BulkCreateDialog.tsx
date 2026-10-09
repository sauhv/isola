'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Group, Proxy } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'

interface Props {
  groups: Group[]
  onClose: () => void
  onDone: (message: string | null) => void
}

const splitLines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
const splitTags = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

export default function BulkCreateDialog({ groups, onClose, onDone }: Props) {
  const { t } = useI18n()
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [count, setCount] = useState('10')
  const [namePattern, setNamePattern] = useState('Profile {n}')
  const [startIndex, setStartIndex] = useState('1')
  const [groupId, setGroupId] = useState('')
  const [platform, setPlatform] = useState('')
  const [tags, setTags] = useState('')
  const [startUrls, setStartUrls] = useState('')
  const [lab, setLab] = useState(false)
  const [proxyMode, setProxyMode] = useState<'none' | 'rotate'>('none')
  const [proxyIds, setProxyIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    call(isola().proxies.list())
      .then(setProxies)
      .catch((e) => setError(e.message))
  }, [])

  const n = Math.min(500, Math.max(0, Number(count) || 0))
  const toggleProxy = (id: string) =>
    setProxyIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function submit() {
    setError(null)
    if (n < 1) return setError(t('bc.errCount'))
    if (!namePattern.trim()) return setError(t('bc.errPattern'))
    if (proxyMode === 'rotate' && proxyIds.size === 0) return setError(t('bc.errProxy'))
    if (!lab && proxyMode === 'none') {
      if (!confirm(t('bc.confirmNoProxy'))) return
    }
    setSaving(true)
    try {
      const r = await call(
        isola().profiles.createMany({
          count: n,
          namePattern: namePattern.trim(),
          startIndex: Number(startIndex) || 1,
          groupId: groupId || null,
          platform: platform.trim() || null,
          tags: splitTags(tags),
          startUrls: splitLines(startUrls),
          lab: proxyMode === 'none' ? true : lab,
          proxyIds: proxyMode === 'rotate' ? [...proxyIds] : []
        })
      )
      const msg =
        r.errors.length === 0
          ? null
          : t('bc.doneErrors', { c: r.created, n, e: r.errors.length, i: r.errors[0].index, r: r.errors[0].reason })
      onDone(msg)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" style={{ width: 'min(620px, calc(100vw - 32px))' }}>
        <h2>{t('bc.title')}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <div className="form-row">
            <label className="field" style={{ width: 120 }}>
              <span>{t('bc.count')}</span>
              <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>{t('bc.pattern')}</span>
              <input value={namePattern} onChange={(e) => setNamePattern(e.target.value)} placeholder="Profile {n}" />
              <span className="hint">{t('bc.patternHint', { a: '{n}' })}</span>
            </label>
            <label className="field" style={{ width: 120 }}>
              <span>{t('bc.startAt')}</span>
              <input value={startIndex} onChange={(e) => setStartIndex(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
            </label>
          </div>

          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>
              <span>{t('common.group')}</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">{t('common.noGroup')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>{t('bc.platform')}</span>
              <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="facebook, tiktok…" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Tag</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('pf.tagsPh')} />
            </label>
          </div>

          <label className="field">
            <span>{t('bc.startUrls')}</span>
            <textarea rows={2} value={startUrls} onChange={(e) => setStartUrls(e.target.value)} placeholder={t('bc.startUrlsPh')} />
          </label>

          <div className="field">
            <span>Proxy</span>
            <div className="seg">
              <button type="button" className={proxyMode === 'none' ? 'active' : undefined} onClick={() => setProxyMode('none')}>
                {t('bc.noProxyLab')}
              </button>
              <button type="button" className={proxyMode === 'rotate' ? 'active' : undefined} onClick={() => setProxyMode('rotate')}>
                {t('bc.rotate')}
              </button>
            </div>
          </div>

          {proxyMode === 'rotate' && (
            <>
              <div className="pick-list" style={{ marginLeft: 0 }}>
                {proxies.length === 0 && <div className="muted">{t('bc.noProxyYet')}</div>}
                {proxies.map((p) => (
                  <label key={p.id} className="checkbox">
                    <input type="checkbox" checked={proxyIds.has(p.id)} onChange={() => toggleProxy(p.id)} />
                    {p.label} <span className="muted">· {p.type} · {p.host}:{p.port}</span>
                  </label>
                ))}
              </div>
              <span className="hint">
                {t('bc.rotateHint', { s: proxyIds.size, n })}
              </span>
              <label className="checkbox">
                <input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
                {t('bc.labMark')}
              </label>
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>{t('common.cancel')}</button>
          <button className="primary" disabled={saving || n < 1} onClick={submit}>
            {saving && <Loader2 size={14} className="spin" />} {t('bc.create', { n })}
          </button>
        </div>
      </div>
    </div>
  )
}
