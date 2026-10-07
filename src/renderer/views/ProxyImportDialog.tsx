'use client'

import { useState } from 'react'
import type { ProxyImportResult, ProxyType } from '../../shared/types'
import { call, isola } from '../lib/isola'

interface Props {
  onClose: () => void
  onImported: () => void
}

export default function ProxyImportDialog({ onClose, onImported }: Props) {
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
        <h2>Import proxy</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <label className="field">
            <span>Mỗi dòng một proxy (tối đa 500)</span>
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
            <span>Loại mặc định (khi dòng không ghi giao thức)</span>
            <select value={type} onChange={(e) => setType(e.target.value as ProxyType)}>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </label>
          {result && (
            <div className={result.errors.length ? 'note' : 'ok-bar'}>
              Đã thêm {result.created} proxy.
              {result.errors.length > 0 && (
                <>
                  {' '}
                  {result.errors.length} dòng bị bỏ qua:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
                    {result.errors.map((e) => (
                      <li key={e.line}>
                        Dòng {e.line}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>Đóng</button>
          <button className="primary" disabled={busy || lines === 0} onClick={submit}>
            {busy ? 'Đang import…' : `Import ${lines} dòng`}
          </button>
        </div>
      </div>
    </div>
  )
}
