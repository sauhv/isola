'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DownloadProgress, GeoStatus, Proxy } from '../../shared/types'
import { call, isola } from '../lib/isola'
import ProxyEditor from './ProxyEditor'
import ProxyImportDialog from './ProxyImportDialog'

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (min < 1) return 'vừa xong'
  if (min < 60) return `${min} phút trước`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`
}

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [geo, setGeo] = useState<GeoStatus | null>(null)
  const [geoProgress, setGeoProgress] = useState<DownloadProgress | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Proxy | 'new' | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([call(isola().proxies.list()), call(isola().geo.status())])
      setProxies(p)
      setGeo(g)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => isola().onGeoProgress(setGeoProgress), [])

  const replace = (updated: Proxy[]) =>
    setProxies((list) => list.map((p) => updated.find((u) => u.id === p.id) ?? p))

  async function withBusy(ids: string[], fn: () => Promise<void>) {
    setError(null)
    setBusy((s) => new Set([...s, ...ids]))
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy((s) => new Set([...s].filter((x) => !ids.includes(x))))
    }
  }

  const testOne = (id: string) => withBusy([id], async () => replace([await call(isola().proxies.test(id))]))
  const testIds = (ids: string[]) => withBusy(ids, async () => replace(await call(isola().proxies.testMany(ids))))
  const refreshIp = (id: string) => withBusy([id], async () => replace([await call(isola().proxies.refreshIp(id))]))

  async function installGeo() {
    setGeoBusy(true)
    setError(null)
    try {
      setGeo(await call(isola().geo.install()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGeoBusy(false)
      setGeoProgress(null)
    }
  }

  const allSelected = proxies.length > 0 && selected.size === proxies.length
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Proxy</h1>
      </div>
      <div className="panel pad">

      {geo && !geo.installed && (
        <div className="note" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>
            Chưa có dữ liệu GeoIP. Cần nó để biết quốc gia và timezone của proxy (tra offline, khoảng 60 MB). Profile
            production chỉ mở được khi proxy có timezone.
          </span>
          {geoBusy && geoProgress && geoProgress.totalBytes > 0 ? (
            <span className="status">
              <span className="progress">
                <div style={{ width: `${(100 * geoProgress.downloadedBytes) / geoProgress.totalBytes}%` }} />
              </span>
              {mb(geoProgress.downloadedBytes)} / {mb(geoProgress.totalBytes)}
            </span>
          ) : (
            <button className="primary" disabled={geoBusy} onClick={installGeo}>
              {geoBusy ? 'Đang tải…' : 'Tải GeoIP'}
            </button>
          )}
        </div>
      )}

      <div className="toolbar">
        <button disabled={selected.size === 0} onClick={() => testIds([...selected])}>
          Kiểm tra đã chọn ({selected.size})
        </button>
        <button disabled={proxies.length === 0} onClick={() => testIds(proxies.map((p) => p.id))}>
          Kiểm tra tất cả
        </button>
        <div className="spacer" />
        <button onClick={() => setImportOpen(true)}>Import</button>
        <button className="primary" onClick={() => setEditing('new')}>
          Thêm proxy
        </button>
      </div>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button className="small" onClick={() => setError(null)}>
            Đóng
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(proxies.map((p) => p.id)))}
                />
              </th>
              <th>Proxy</th>
              <th>IP ra / vị trí</th>
              <th>Độ trễ</th>
              <th>Profile</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {proxies.map((p) => {
              const c = p.lastCheck
              const isBusy = busy.has(p.id)
              return (
                <tr key={p.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td>
                    {p.label}
                    <div className="muted small-text">
                      {p.type} · {p.host}:{p.port}
                      {p.username && ` · ${p.username}`}
                    </div>
                  </td>
                  <td className="wrap">
                    {isBusy ? (
                      <span className="muted">Đang kiểm…</span>
                    ) : !c ? (
                      <span className="muted">Chưa kiểm</span>
                    ) : c.error ? (
                      <>
                        <span className="status down">Lỗi</span>
                        <div className="muted small-text">{c.error}</div>
                      </>
                    ) : (
                      <>
                        <span className="status running">{c.ip}</span>
                        <div className="muted small-text">
                          {[c.country, c.city, c.timezone ?? 'chưa rõ timezone'].filter(Boolean).join(' · ')}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    {c?.latencyMs != null ? `${c.latencyMs} ms` : <span className="muted">—</span>}
                    {c && <div className="muted small-text">{ago(c.at)}</div>}
                  </td>
                  <td>
                    {p.profileCount > 1 ? (
                      <span title="Nhiều profile dùng chung một IP" className="tag warn">
                        {p.profileCount}
                      </span>
                    ) : (
                      p.profileCount
                    )}
                  </td>
                  <td className="actions">
                    <button className="small" disabled={isBusy} onClick={() => testOne(p.id)}>
                      Kiểm tra
                    </button>
                    {p.refreshUrl && (
                      <button className="small" disabled={isBusy} onClick={() => refreshIp(p.id)}>
                        Đổi IP
                      </button>
                    )}
                    <button className="small" disabled={isBusy} onClick={() => setEditing(p)}>
                      Sửa
                    </button>
                    <button
                      className="small danger"
                      disabled={isBusy || p.profileCount > 0}
                      title={p.profileCount > 0 ? 'Đang gán cho profile' : undefined}
                      onClick={() => {
                        if (!confirm(`Xóa proxy "${p.label}"?`)) return
                        withBusy([p.id], async () => {
                          await call(isola().proxies.remove(p.id))
                          await reload()
                        })
                      }}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {proxies.length === 0 && <div className="empty">Chưa có proxy. Bấm "Thêm proxy" hoặc "Import".</div>}
      </div>

      {geo?.installed && (
        <p className="muted small-text" style={{ marginTop: 12 }}>
          Dữ liệu GeoIP {geo.version} · IP geolocation by{' '}
          <span title="https://db-ip.com">DB-IP</span> (CC BY 4.0)
        </p>
      )}

      {editing && (
        <ProxyEditor
          proxy={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {importOpen && (
        <ProxyImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => {
            reload()
          }}
        />
      )}
      </div>
    </>
  )
}
