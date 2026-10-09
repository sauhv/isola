'use client'

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Cookie,
  Copy,
  CopyPlus,
  LayoutGrid,
  FolderInput,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Share2,
  Trash2,
  Upload
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Group, Profile, Tag } from '../../../shared/types'
import Menu from '../../components/Menu'
import { runBatch } from '../../lib/batch'
import { colorFor, countryName, dateTimeParts } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'
import { notYet, toast } from '../../lib/toast'
import BulkCreateDialog from './BulkCreateDialog'
import MoveGroupDialog from './MoveGroupDialog'

type SortKey = 'serial' | 'lastOpened'
const PAGE_SIZES = [20, 50, 100]

interface Props {
  /** Tăng khi trang tạo/sửa lưu xong, để bảng tải lại. */
  reloadTick: number
  onCreate: () => void
  onEdit: (profile: Profile) => void
}

export default function ProfilesTab({ reloadTick, onCreate, onEdit }: Props) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [groupId, setGroupId] = useState('')
  const [tagId, setTagId] = useState('')
  const [search, setSearch] = useState('')
  const [openedOnly, setOpenedOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'serial', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moving, setMoving] = useState<Profile[] | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [p, g, t] = await Promise.all([
        call(isola().profiles.list({ groupId: groupId || undefined, tagId: tagId || undefined })),
        call(isola().groups.list()),
        call(isola().tags.list())
      ])
      setProfiles(p)
      setGroups(g)
      setTags(t)
      setSelected((s) => new Set([...s].filter((id) => p.some((x) => x.id === id))))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [groupId, tagId])

  useEffect(() => {
    reload()
  }, [reload, reloadTick])

  // Trạng thái chạy/dừng do main đẩy xuống, kể cả khi người dùng tự đóng cửa sổ Chrome.
  useEffect(
    () =>
      isola().onProfileStatus(({ id, status }) => {
        setProfiles((list) =>
          list.map((p) =>
            p.id === id ? { ...p, status, lastOpenedAt: status === 'running' ? new Date().toISOString() : p.lastOpenedAt } : p
          )
        )
      }),
    []
  )

  const runningCount = profiles.filter((p) => p.status === 'running').length

  // Tìm theo tên, ID, ghi chú, IP proxy, nền tảng.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = profiles
    if (openedOnly) list = list.filter((p) => p.status === 'running')
    if (q) {
      list = list.filter((p) =>
        [p.name, p.id, String(p.serial), p.notes, p.proxy?.ip, p.proxy?.host, p.platform]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    }
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) =>
      sort.key === 'serial'
        ? (a.serial - b.serial) * dir
        : ((a.lastOpenedAt ?? '') < (b.lastOpenedAt ?? '') ? -1 : (a.lastOpenedAt ?? '') > (b.lastOpenedAt ?? '') ? 1 : 0) * dir
    )
  }, [profiles, search, openedOnly, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize)
  const selectedProfiles = profiles.filter((p) => selected.has(p.id))
  const allOnPage = rows.length > 0 && rows.every((p) => selected.has(p.id))

  useEffect(() => setPage(1), [search, openedOnly, groupId, tagId, pageSize])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function single(id: string, fn: () => Promise<unknown>) {
    setBusy((s) => new Set(s).add(id))
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  async function bulk(fn: () => Promise<string | null>, thenReload = false) {
    setBulkBusy(true)
    setError(null)
    try {
      const err = await fn()
      if (err) setError(err)
      if (thenReload) await reload()
    } finally {
      setBulkBusy(false)
    }
  }

  const openMany = () =>
    bulk(() =>
      runBatch(
        selectedProfiles.filter((p) => p.status !== 'running'),
        (p) => p.name,
        (p) => call(isola().profiles.start(p.id))
      )
    )
  const arrange = () =>
    bulk(async () => {
      const n = await call(isola().profiles.arrangeWindows([...selected]))
      toast(n ? t('pt.arranged', { n }) : t('pt.noneRunning'), n ? 'success' : 'info')
      return null
    })
  const exportCookies = (p: Profile) =>
    single(p.id, async () => {
      const r = await call(isola().profiles.exportCookies(p.id))
      if (r.saved) toast(t('pt.exported', { n: r.count }), 'success')
    })
  const closeMany = () =>
    bulk(() =>
      runBatch(
        selectedProfiles.filter((p) => p.status === 'running'),
        (p) => p.name,
        (p) => call(isola().profiles.stop(p.id))
      )
    )
  const trashMany = (list: Profile[]) => {
    const running = list.filter((p) => p.status === 'running')
    if (running.length) {
      setError(t('pt.closeFirst', { n: running.length }))
      return
    }
    if (!confirm(t('pt.confirmTrash', { n: list.length }))) return
    bulk(() => runBatch(list, (p) => p.name, (p) => call(isola().profiles.archive(p.id))), true)
  }

  const sortIcon = (key: SortKey) =>
    sort.key !== key ? <ArrowUpDown size={12} /> : sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />

  return (
    <>
      <div className="toolbar">
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ width: 170 }}>
          <option value="">{t('pt.allGroups')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.profileCount})
            </option>
          ))}
        </select>
        <div className="search" style={{ flex: 1, maxWidth: 520 }}>
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('pt.searchPh')} />
        </div>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)} style={{ width: 150 }}>
          <option value="">{t('pt.anyTag')}</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="checkbox" style={{ marginLeft: 6 }}>
          <input type="checkbox" checked={openedOnly} onChange={(e) => setOpenedOnly(e.target.checked)} />
          {t('pt.openedN', { n: runningCount })}
        </label>
      </div>

      <div className="toolbar">
        <button className="soft" disabled={bulkBusy || selected.size === 0} onClick={openMany}>
          <Play size={15} /> {t('common.open')}
        </button>
        <button disabled={bulkBusy || selected.size === 0} onClick={closeMany}>
          <Square size={14} /> {t('common.close')}
        </button>
        <button disabled={bulkBusy || selected.size === 0} onClick={() => setMoving(selectedProfiles)}>
          <FolderInput size={15} /> {t('pt.moveGroup')}
        </button>
        <button disabled={bulkBusy || selected.size === 0} onClick={() => notYet('Xuất profile')}>
          <Upload size={15} /> Export
        </button>
        <button disabled={bulkBusy || selected.size === 0} onClick={() => notYet(t('pt.shareProfile'))}>
          <Share2 size={15} /> {t('pt.share')}
        </button>
        <button
          className="icon"
          title={t('pt.trashTitle')}
          disabled={bulkBusy || selected.size === 0}
          onClick={() => trashMany(selectedProfiles)}
        >
          <Trash2 size={15} />
        </button>
        <button disabled={bulkBusy || runningCount === 0} title={t('pt.arrangeTitle')} onClick={arrange}>
          <LayoutGrid size={15} /> {t('pt.arrange')}
        </button>
        {selected.size > 0 && (
          <span className="muted" style={{ marginLeft: 4 }}>
            {t('common.selected', { n: selected.size })}
            <button className="link" style={{ marginLeft: 8 }} onClick={() => setSelected(new Set())}>
              {t('common.deselect')}
            </button>
          </span>
        )}
        {bulkBusy && <Loader2 size={16} className="spin muted" />}
        <div className="spacer" />
        <button onClick={() => setBulkOpen(true)}>
          <Boxes size={15} /> {t('pt.bulkCreate')}
        </button>
        <button className="primary" onClick={onCreate}>
          <Plus size={15} /> {t('app.create')}
        </button>
        <button className="icon" title={t('common.reload')} onClick={reload}>
          <RefreshCw size={15} />
        </button>
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
                  checked={allOnPage}
                  onChange={() =>
                    setSelected((s) => {
                      const next = new Set(s)
                      rows.forEach((p) => (allOnPage ? next.delete(p.id) : next.add(p.id)))
                      return next
                    })
                  }
                />
              </th>
              <th className="sortable" onClick={() => toggleSort('serial')}>
                <span className="th-sort">
                  {t('common.no')} {sortIcon('serial')}
                </span>
              </th>
              <th>ID</th>
              <th>{t('common.group')}</th>
              <th>{t('common.name')}</th>
              <th>IP</th>
              <th>{t('pt.colNotes')}</th>
              <th className="sortable" onClick={() => toggleSort('lastOpened')}>
                <span className="th-sort">
                  {t('pt.colLastOpen')} {sortIcon('lastOpened')}
                </span>
              </th>
              <th>{t('pt.colPlatform')}</th>
              <th>Tag</th>
              <th className="sticky-right" style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const running = p.status === 'running'
              const isBusy = busy.has(p.id)
              const opened = dateTimeParts(p.lastOpenedAt)
              const px = p.proxy
              return (
                <tr key={p.id} className={selected.has(p.id) ? 'selected' : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td>{p.serial}</td>
                  <td className="mono muted" title={p.id}>
                    {p.id.slice(0, 8)}
                  </td>
                  <td className="clip">{p.groupName ?? <span className="muted">—</span>}</td>
                  <td className="clip" title={p.name}>
                    {p.name}
                    {p.lab && <span className="tag lab" style={{ marginLeft: 6 }}>lab</span>}
                  </td>
                  <td>
                    {px ? (
                      <div className="ip-cell" title={px.error ?? `${px.label} · ${px.type}`}>
                        <MapPin
                          size={14}
                          color={px.error ? 'var(--danger)' : px.ip ? 'var(--ok)' : 'var(--muted)'}
                        />
                        <div>
                          <div>{px.ip ?? px.host}</div>
                          <div className="muted small-text">
                            {px.error ? t('pt.proxyErr') : px.country ? `${px.country} - ${countryName(px.country)}` : t('proxies.notChecked')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="muted">{p.lab ? t('pt.noProxy') : t('pt.noProxyAssigned')}</span>
                    )}
                  </td>
                  <td>{p.notes ? <div className="two-line" title={p.notes}>{p.notes}</div> : <span className="muted">—</span>}</td>
                  <td>
                    {opened ? (
                      <>
                        <div>{opened[0]}</div>
                        <div className="muted small-text">{opened[1]}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {p.platform ? (
                      <span className="platform">
                        <span className="platform-badge" style={{ background: colorFor(p.platform) }}>
                          {p.platform.slice(0, 1)}
                        </span>
                        {p.platform}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="clip">
                    {p.tags.length ? (
                      p.tags.map((tag) => (
                        <span key={tag.id} className="tag">
                          {tag.name}
                        </span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="actions">
                    <div>
                      {running ? (
                        <button
                          className="small danger-solid"
                          style={{ minWidth: 76 }}
                          disabled={isBusy}
                          onClick={() => single(p.id, () => call(isola().profiles.stop(p.id)))}
                        >
                          {isBusy ? <Loader2 size={13} className="spin" /> : <Square size={12} fill="currentColor" />} {t('common.close')}
                        </button>
                      ) : (
                        <button
                          className="small primary"
                          style={{ minWidth: 76 }}
                          disabled={isBusy}
                          onClick={() => single(p.id, () => call(isola().profiles.start(p.id)))}
                        >
                          {isBusy ? <Loader2 size={13} className="spin" /> : <Play size={13} fill="currentColor" />} {t('common.open')}
                        </button>
                      )}
                      <Menu
                        trigger={(toggleMenu) => (
                          <button className="icon small ghost" onClick={toggleMenu} title={t('common.more')}>
                            <MoreVertical size={16} />
                          </button>
                        )}
                        items={[
                          { label: t('common.edit'), icon: <Pencil size={14} />, onClick: () => onEdit(p) },
                          {
                            label: t('pt.clone'),
                            icon: <CopyPlus size={14} />,
                            onClick: () => single(p.id, () => call(isola().profiles.clone(p.id)).then(reload))
                          },
                          {
                            label: t('pt.exportCookie'),
                            icon: <Cookie size={14} />,
                            disabled: !running,
                            onClick: () => exportCookies(p)
                          },
                          { label: t('pt.moveGroup'), icon: <FolderInput size={14} />, onClick: () => setMoving([p]) },
                          {
                            label: t('pt.copyId'),
                            icon: <Copy size={14} />,
                            onClick: () => navigator.clipboard.writeText(p.id).catch(() => {})
                          },
                          'divider',
                          {
                            label: t('pt.trashTitle'),
                            icon: <Trash2 size={14} />,
                            danger: true,
                            disabled: running,
                            onClick: () => trashMany([p])
                          }
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty">
            {profiles.length === 0 ? t('pt.emptyNone') : t('pt.emptyFilter')}
          </div>
        )}
      </div>

      <div className="table-foot">
        <span>{t('pt.total', { n: filtered.length })}</span>
        <button className="icon small ghost" disabled={current <= 1} onClick={() => setPage(current - 1)}>
          <ChevronLeft size={16} />
        </button>
        <input
          value={current}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ''))
            if (n >= 1) setPage(Math.min(n, pages))
          }}
        />
        <span>/ {pages}</span>
        <button className="icon small ghost" disabled={current >= pages} onClick={() => setPage(current + 1)}>
          <ChevronRight size={16} />
        </button>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {t('pt.perPage', { n })}
            </option>
          ))}
        </select>
      </div>

      {moving && (
        <MoveGroupDialog
          profiles={moving}
          groups={groups}
          onClose={() => setMoving(null)}
          onDone={(err) => {
            setMoving(null)
            if (err) setError(err)
            reload()
          }}
        />
      )}
      {bulkOpen && (
        <BulkCreateDialog
          groups={groups}
          onClose={() => setBulkOpen(false)}
          onDone={(msg) => {
            setBulkOpen(false)
            if (msg) setError(msg)
            reload()
          }}
        />
      )}
    </>
  )
}
