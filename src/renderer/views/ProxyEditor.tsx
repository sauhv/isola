'use client'

import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Proxy, ProxyCheck, ProxyType } from '../../shared/types'
import { countryName } from '../lib/format'
import { currentLang, D } from '../lib/i18n'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'

interface Props {
  proxy: Proxy | null
  onClose: () => void
  onSaved: () => void
}

function checkText(c: ProxyCheck): string {
  if (c.error) { const e = D['px.errPrefix']; return (e ? (currentLang === 'vi' ? e[0] : e[1]) : 'Error: {e}').split('{e}').join(c.error) }
  return [c.ip, c.country && `${c.country} - ${countryName(c.country)}`, c.city, c.timezone, c.latencyMs != null && `${c.latencyMs} ms`]
    .filter(Boolean)
    .join(' · ')
}

export default function ProxyEditor({ proxy, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const [label, setLabel] = useState(proxy?.label ?? '')
  const [type, setType] = useState<ProxyType>(proxy?.type ?? 'http')
  const [host, setHost] = useState(proxy?.host ?? '')
  const [port, setPort] = useState(proxy ? String(proxy.port) : '')
  const [username, setUsername] = useState(proxy?.username ?? '')
  // Password không bao giờ được gửi xuống renderer. Ô trống khi sửa = giữ nguyên.
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [refreshUrl, setRefreshUrl] = useState(proxy?.refreshUrl ?? '')
  const [check, setCheck] = useState<ProxyCheck | null>(proxy?.lastCheck ?? null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fields = () => ({
    label: label.trim() || undefined,
    type,
    host: host.trim(),
    port: Number(port),
    username: username.trim() || null,
    refreshUrl: refreshUrl.trim() || null,
    ...(clearPassword ? { password: null } : password ? { password } : proxy ? {} : { password: null })
  })

  async function testNow() {
    if (!host.trim() || !port) return
    setChecking(true)
    setError(null)
    try {
      // Sửa proxy đã có mật khẩu mà không nhập lại: kiểm trực tiếp proxy đã lưu.
      if (proxy && proxy.hasPassword && !password && !clearPassword && host.trim() === proxy.host && Number(port) === proxy.port) {
        setCheck((await call(isola().proxies.test(proxy.id))).lastCheck)
      } else {
        setCheck(
          await call(
            isola().proxies.testDraft({
              type,
              host: host.trim(),
              port: Number(port),
              username: username.trim() || null,
              password: password || null
            })
          )
        )
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (proxy) await call(isola().proxies.update(proxy.id, fields()))
      else await call(isola().proxies.create(fields()))
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit} autoComplete="off">
        <h2>{proxy ? t('px.titleEdit') : t('px.titleAdd')}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          {proxy && (
            <div className="row-field">
              <span className="row-label">Proxy ID</span>
              <span className="mono muted">{proxy.id}</span>
            </div>
          )}
          <label className="field">
            <span>{t('common.label')}</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('px.labelPh')} />
          </label>
          <div className="form-row">
            <label className="field" style={{ width: 130 }}>
              <span>{t('px.type')}</span>
              <select value={type} onChange={(e) => setType(e.target.value as ProxyType)}>
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>IP checker</span>
              <select disabled title={t('px.ipCheckerTitle')}>
                <option>DB-IP (offline)</option>
              </select>
            </label>
          </div>
          <div className="field">
            <span>Host : Port</span>
            <div className="form-row">
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host" required autoFocus style={{ flex: 1 }} />
              <input
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                placeholder="Port"
                required
                inputMode="numeric"
                style={{ width: 100 }}
              />
              <button type="button" disabled={checking || !host.trim() || !port} onClick={testNow}>
                {checking && <Loader2 size={14} className="spin" />} {t('common.check')}
              </button>
            </div>
            {check && <div className={`check-result ${check.error ? 'status down' : 'status running'}`}>{checkText(check)}</div>}
          </div>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Username</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Password</span>
              <input
                type="password"
                value={password}
                disabled={clearPassword}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={proxy?.hasPassword ? t('px.keepPw') : ''}
                autoComplete="new-password"
              />
            </label>
          </div>
          {proxy?.hasPassword && (
            <label className="checkbox">
              <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
              {t('px.clearPw')}
            </label>
          )}
          <label className="field">
            <span>{t('px.changeIpUrl')}</span>
            <input value={refreshUrl} onChange={(e) => setRefreshUrl(e.target.value)} placeholder="https://..." />
            <span className="hint">{t('px.changeIpHint')}</span>
          </label>
          <p className="hint muted small-text" style={{ margin: 0 }}>
            {t('px.pwEncrypted')}
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="primary" disabled={saving || !host.trim() || !port}>
            {proxy ? t('common.save') : t('common.add')}
          </button>
        </div>
      </form>
    </div>
  )
}
