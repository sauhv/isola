'use client'

import { Download, Hammer, RefreshCw, Search, Settings, Tag, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DownloadProgress, GeoStatus, Proxy } from '../../shared/types'
import { runBatch } from '../lib/batch'
import { countryName, timeAgo } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'
import { notYet } from '../lib/toast'
import ProxyEditor from './ProxyEditor'
import ProxyImportDialog from './ProxyImportDialog'

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

type SubTab = 'list' | 'rotating' | 'provider' | 'resources'
const SUBTABS: { id: SubTab; key: string }[] = [
  { id: 'list', key: 'subtab.list' },
  { id: 'rotating', key: 'subtab.rotating' },
  { id: 'provider', key: 'subtab.provider' },
  { id: 'resources', key: 'subtab.resources' }
]

type Category = 'all' | 'static' | 'datacenter' | 'imported'

export default function ProxiesPage() {
  const { t } = useI18n()
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
      setError(t('proxies.blockedDelete', { n: blocked.length }))
      return
    }
    if (!confirm(t('proxies.confirmDelete', { n: list.length }))) return
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
              {t(s.key)}
            </button>
          ))}
        </div>

        {subtab === 'rotating' && comingSoon(t('proxies.rotating.title'), t('proxies.rotating.desc'))}
        {subtab === 'provider' && comingSoon(t('proxies.provider.title'), t('proxies.provider.desc'))}
        {subtab === 'resources' && comingSoon(t('proxies.resources.title'), t('proxies.resources.desc'))}

        {subtab === 'list' && (
          <>
            {geo && !geo.installed && (
              <div className="note" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flex: 1 }}>
                  {t('proxies.geoNote')}
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
                    {geoBusy ? t('common.loading') : t('proxies.downloadGeo')}
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
                  placeholder={t('proxies.searchPh')}
                />
              </div>
              <button className="primary" onClick={() => setEditing('new')}>
                {t('proxies.add')}
              </button>
              <button onClick={() => setImportOpen(true)}>
                <Download size={15} /> Import
              </button>
              <button onClick={() => notYet(t('proxies.exportProxy'))}>
                <Upload size={15} /> Export
              </button>
              <button disabled={proxies.length === 0} onClick={() => testIds(filtered.map((p) => p.id))}>
                {t('proxies.checkAll')}
              </button>
              <div className="spacer" />
              <button className="icon" title={t('proxies.tag')} onClick={() => notYet(t('proxies.tagProxy'))}>
                <Tag size={15} />
              </button>
              <button className="icon" title={t('proxies.settings')} onClick={() => notYet(t('proxies.settings'))}>
                <Settings size={15} />
              </button>
              <button className="icon" title={t('common.reload')} onClick={reload}>
                <RefreshCw size={15} />
              </button>
            </div>

            <div className="toolbar" style={{ marginTop: -4 }}>
              <button className="soft" disabled={selected.size === 0} onClick={() => testIds([...selected])}>
                {t('proxies.checkSelected', { n: selected.size })}
              </button>
              <button disabled={selected.size === 0} onClick={() => removeMany([...selected])}>
                <Trash2 size={15} /> {t('common.delete')}
              </button>
              {selected.size > 0 && (
                <button className="link" onClick={() => setSelected(new Set())}>
                  {t('common.deselect')}
                </button>
              )}
            </div>

            <div className="chipbar">
              {(
                [
                  ['all', t('proxies.catAll', { n: counts.all })],
                  ['static', t('proxies.catStatic', { n: counts.static })],
                  ['datacenter', t('proxies.catDatacenter', { n: counts.datacenter })],
                  ['imported', t('proxies.catImported', { n: counts.imported })]
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
                    <th>{t('proxies.colType')}</th>
                    <th>{t('proxies.colIpLoc')}</th>
                    <th>{t('proxies.colLatency')}</th>
                    <th>Profile</th>
                    <th className="sticky-right" style={{ textAlign: 'right' }}>
                      {t('common.actions')}
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
                            <span className="muted">{t('proxies.checking')}</span>
                          ) : !c ? (
                            <span className="muted">{t('proxies.notChecked')}</span>
                          ) : c.error ? (
                            <>
                              <span className="status down">{t('proxies.errLabel')}</span>
                              <div className="muted small-text">{c.error}</div>
                            </>
                          ) : (
                            <>
                              <span className="status running">{c.ip}</span>
                              <div className="muted small-text">
                                {[c.country && `${c.country} - ${countryName(c.country)}`, c.city, c.timezone ?? t('proxies.noTz')]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </>
                          )}
                        </td>
                        <td>
                          {c?.latencyMs != null ? `${c.latencyMs} ms` : <span className="muted">—</span>}
                          {c && <div className="muted small-text">{timeAgo(c.at)}</div>}
                        </td>
                        <td>
                          {p.profileCount > 1 ? (
                            <span title={t('proxies.sharedIp')} className="tag warn">
                              {p.profileCount}
                            </span>
                          ) : (
                            p.profileCount
                          )}
                        </td>
                        <td className="actions">
                          <div>
                            <button className="small" disabled={isBusy} onClick={() => testOne(p.id)}>
                              {t('common.check')}
                            </button>
                            {p.refreshUrl && (
                              <button className="small" disabled={isBusy} onClick={() => refreshIp(p.id)}>
                                {t('proxies.changeIp')}
                              </button>
                            )}
                            <button className="small" disabled={isBusy} onClick={() => setEditing(p)}>
                              {t('common.edit')}
                            </button>
                            <button
                              className="small danger"
                              disabled={isBusy || !deletable(p)}
                              title={!deletable(p) ? t('proxies.inUse') : undefined}
                              onClick={() => removeMany([p.id])}
                            >
                              {t('common.delete')}
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
                    ? t('proxies.emptyUncat')
                    : proxies.length === 0
                      ? t('proxies.emptyNone')
                      : t('proxies.emptyFilter')}
                </div>
              )}
            </div>

            {geo?.installed && (
              <p className="muted small-text" style={{ marginTop: 12 }}>
                {t('proxies.geoCredit', { v: geo.version ?? '' })}
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
