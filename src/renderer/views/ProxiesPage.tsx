'use client'

import { Download, Hammer, RefreshCw, Search, Settings, Tag, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DownloadProgress, GeoStatus, Proxy } from '../../shared/types'
import { runBatch } from '../lib/batch'
import { countryName } from '../lib/format'
import { call, isola } from '../lib/isola'
import { notYet } from '../lib/toast'
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

type SubTab = 'list' | 'rotating' | 'provider' | 'resources'
const SUBTABS: { id: SubTab; label: string }[] = [
  { id: 'list', label: 'Danh sách' },
  { id: 'rotating', label: 'Proxy xoay' },
  { id: 'provider', label: 'Nhà cung cấp' },
  { id: 'resources', label: 'Tài nguyên' }
]

type Category = 'all' | 'static' | 'datacenter' | 'imported'

export default function ProxiesPage() {
  const [subtab, setSubtab] = useState<SubTab>('list')
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [geo, setGeo] = useState<GeoStatus | null>(null)
  const [geoProgress, setGeoProgress] = useState<DownloadProgress | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('all')
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
      setSelected((s) => new Set([...s].filter((id) => p.some((x) => x.id === id))))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => isola().onGeoProgress(setGeoProgress), [])

  const replace = (updated: Proxy[]) => setProxies((list) => list.map((p) => updated.find((u) => u.id === p.id) ?? p))

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    // Mọi proxy hiện tại đều do người dùng nhập/thêm; Static ISP / Datacenter chưa phân loại.
    let list = category === 'static' || category === 'datacenter' ? [] : proxies
    if (q) {
      list = list.filter((p) =>
        [p.label, p.host, String(p.port), p.username, p.lastCheck?.ip, p.lastCheck?.country]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    }
    return list
  }, [proxies, search, category])

  const deletable = (p: Proxy) => p.profileCount === 0
  const removeMany = (ids: string[]) => {
    const list = proxies.filter((p) => ids.includes(p.id))
    const blocked = list.filter((p) => !deletable(p))
    if (blocked.length) {
      setError(`${blocked.length} proxy đang gán cho profile, không xóa được. Gỡ khỏi profile trước.`)
      return
    }
    if (!confirm(`Xóa ${list.length} proxy?`)) return
    withBusy(ids, async () => {
      setError(await runBatch(list, (p) => p.label, (p) => call(isola().proxies.remove(p.id))))
      await reload()
    })
  }

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const counts = { all: proxies.length, static: 0, datacenter: 0, imported: proxies.length }

  const comingSoon = (title: string, desc: string) => (
    <div className="coming-soon">
      <Hammer size={40} />
      <h4>{title}</h4>
      <p>{desc}</p>
    </div>
  )

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Proxy</h1>
      </div>
      <div className="panel pad">
        <div className="subtabs">
          {SUBTABS.map((s) => (
            <button key={s.id} className={`subtab${subtab === s.id ? ' active' : ''}`} onClick={() => setSubtab(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        {subtab === 'rotating' && comingSoon('Proxy xoay', 'Quản lý proxy xoay theo phiên. Tính năng chưa phát triển.')}
        {subtab === 'provider' &&
          comingSoon('Nhà cung cấp proxy', 'Kết nối nhà cung cấp để mua và đồng bộ proxy. Tính năng chưa phát triển.')}
        {subtab === 'resources' && comingSoon('Tài nguyên', 'Hướng dẫn và tài nguyên về proxy. Tính năng chưa phát triển.')}

        {subtab === 'list' && (
          <>
            {geo && !geo.installed && (
              <div className="note" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: 1 }}>
                  Chưa có dữ liệu GeoIP. Cần nó để biết quốc gia và timezone của proxy (tra offline, khoảng 60 MB).
                  Profile production chỉ mở được khi proxy có timezone.
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
              <div className="search" style={{ flex: 1, maxWidth: 440 }}>
                <Search size={16} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo nhãn, host, IP, quốc gia"
                />
              </div>
              <button className="primary" onClick={() => setEditing('new')}>
                Thêm proxy
              </button>
              <button onClick={() => setImportOpen(true)}>
                <Download size={15} /> Import
              </button>
              <button onClick={() => notYet('Xuất proxy')}>
                <Upload size={15} /> Export
              </button>
              <button disabled={proxies.length === 0} onClick={() => testIds(filtered.map((p) => p.id))}>
                Kiểm tra tất cả
              </button>
              <div className="spacer" />
              <button className="icon" title="Gắn thẻ" onClick={() => notYet('Gắn thẻ proxy')}>
                <Tag size={15} />
              </button>
              <button className="icon" title="Cài đặt proxy" onClick={() => notYet('Cài đặt proxy')}>
                <Settings size={15} />
              </button>
              <button className="icon" title="Tải lại" onClick={reload}>
                <RefreshCw size={15} />
              </button>
            </div>

            <div className="toolbar" style={{ marginTop: -4 }}>
              <button className="soft" disabled={selected.size === 0} onClick={() => testIds([...selected])}>
                Kiểm tra đã chọn ({selected.size})
              </button>
              <button disabled={selected.size === 0} onClick={() => removeMany([...selected])}>
                <Trash2 size={15} /> Xóa
              </button>
              {selected.size > 0 && (
                <button className="link" onClick={() => setSelected(new Set())}>
                  Bỏ chọn
                </button>
              )}
            </div>

            <div className="chipbar">
              {(
                [
                  ['all', `Tất cả (${counts.all})`],
                  ['static', `Static ISP (${counts.static})`],
                  ['datacenter', `Datacenter (${counts.datacenter})`],
                  ['imported', `Đã nhập (${counts.imported})`]
                ] as [Category, string][]
              ).map(([id, label]) => (
                <button key={id} className={`chip-tab${category === id ? ' active' : ''}`} onClick={() => setCategory(id)}>
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div className="error-bar">
                <span>{error}</span>
                <button className="small ghost" onClick={() => setError(null)}>
                  Đóng
                </button>
              </div>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() =>
                          setSelected((s) => {
                            const next = new Set(s)
                            filtered.forEach((p) => (allSelected ? next.delete(p.id) : next.add(p.id)))
                            return next
                          })
                        }
                      />
                    </th>
                    <th>Proxy</th>
                    <th>Loại</th>
                    <th>IP ra / vị trí</th>
                    <th>Độ trễ</th>
                    <th>Profile</th>
                    <th className="sticky-right" style={{ textAlign: 'right' }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const c = p.lastCheck
                    const isBusy = busy.has(p.id)
                    return (
                      <tr key={p.id} className={selected.has(p.id) ? 'selected' : undefined}>
                        <td>
                          <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                        </td>
                        <td>
                          {p.label}
                          <div className="muted small-text">
                            {p.host}:{p.port}
                            {p.username && ` · ${p.username}`}
                          </div>
                        </td>
                        <td className="muted">{p.type}</td>
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
                                {[c.country && `${c.country} - ${countryName(c.country)}`, c.city, c.timezone ?? 'chưa rõ timezone']
                                  .filter(Boolean)
                                  .join(' · ')}
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
                          <div>
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
                              disabled={isBusy || !deletable(p)}
                              title={!deletable(p) ? 'Đang gán cho profile' : undefined}
                              onClick={() => removeMany([p.id])}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="empty">
                  {category === 'static' || category === 'datacenter'
                    ? 'Chưa phân loại proxy theo nhóm này.'
                    : proxies.length === 0
                      ? 'Chưa có proxy. Bấm "Thêm proxy" hoặc "Import".'
                      : 'Không có proxy khớp bộ lọc.'}
                </div>
              )}
            </div>

            {geo?.installed && (
              <p className="muted small-text" style={{ marginTop: 12 }}>
                Dữ liệu GeoIP {geo.version} · IP geolocation by <span title="https://db-ip.com">DB-IP</span> (CC BY 4.0)
              </p>
            )}
          </>
        )}
      </div>

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
      {importOpen && <ProxyImportDialog onClose={() => setImportOpen(false)} onImported={() => reload()} />}
    </>
  )
}
