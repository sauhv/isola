'use client'

import { useState } from 'react'
import type { ProxyImportResult, ProxyType } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'

interface Props {
  onClose: () => void
  onImported: () => void
}

export default function ProxyImportDialog({ onClose, onImported }: Props) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [type, setType] = useState<ProxyType>('http')
  const [result, setResult] = useState<ProxyImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const r = await call(isola().proxies.import(text, type))
      setResult(r)
      if (r.created > 0) onImported()
      if (r.errors.length === 0) setText('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>{t('proxyimport.title')}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <label className="field">
            <span>{t('proxyimport.lines')}</span>
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }}
              placeholder={'host:port\nhost:port:user:pass\nuser:pass@host:port\nsocks5://user:pass@host:port'}
            />
          </label>
          <label className="field" style={{ width: 260 }}>
            <span>{t('proxyimport.defaultType')}</span>
            <select value={type} onChange={(e) => setType(e.target.value as ProxyType)}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </label>
          {result && (
            <div className={result.errors.length ? 'note' : 'ok-bar'}>
              {t('proxyimport.added', { n: result.created })}
              {result.errors.length > 0 && (
                <>
                  {' '}
                  {t('proxyimport.skipped', { n: result.errors.length })}
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
                    {result.errors.map((e) => (
                      <li key={e.line}>
                        {t('proxyimport.line', { n: e.line, r: e.reason })}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>{t('common.close')}</button>
          <button className="primary" disabled={busy || lines === 0} onClick={submit}>
            {busy ? t('proxyimport.importing') : t('proxyimport.importN', { n: lines })}
          </button>
        </div>
      </div>
    </div>
  )
}
