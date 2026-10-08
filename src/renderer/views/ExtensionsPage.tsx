'use client'

import { CheckCircle2, FilePlus, FolderPlus, Hammer, LayoutGrid, MoreVertical, RefreshCw, Search, Store, Upload } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Extension, Group, Profile } from '../../shared/types'
import Menu from '../components/Menu'
import { call, isola } from '../lib/isola'
import { notYet } from '../lib/toast'
import ExtensionScopeDialog from './ExtensionScopeDialog'

type SubTab = 'team' | 'recommended'

export default function ExtensionsPage() {
  const [subtab, setSubtab] = useState<SubTab>('team')
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [updates, setUpdates] = useState<Record<string, string>>({})
  const [storeInput, setStoreInput] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [scopeOf, setScopeOf] = useState<Extension | null>(null)

  const reload = useCallback(async () => {
    try {
      const [e, g, p] = await Promise.all([
        call(isola().extensions.list()),
        call(isola().groups.list()),
        call(isola().profiles.list())
      ])
      setExtensions(e)
      setGroups(g)
      setProfiles(p)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  async function run(key: string, fn: () => Promise<string | null | void>) {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      const msg = await fn()
      if (msg) setNotice(msg)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function addFromStore(e: FormEvent) {
    e.preventDefault()
    if (!storeInput.trim()) return
    run('store', async () => {
      const ext = await call(isola().extensions.addFromStore(storeInput))
      setStoreInput('')
      return `Đã thêm ${ext.name} ${ext.version}.`
    })
  }

  const addFromFile = (kind: 'file' | 'folder') =>
    run(kind, async () => {
      const ext = await call(isola().extensions.addFromFile(kind))
      return ext ? `Đã thêm ${ext.name} ${ext.version}.` : null
    })

  const checkUpdates = () =>
    run('check', async () => {
      const list = await call(isola().extensions.checkUpdates())
      const found = Object.fromEntries(list.filter((u) => u.latest).map((u) => [u.id, u.latest!]))
      setUpdates(found)
      const n = Object.keys(found).length
      return n ? `Có ${n} extension có bản mới.` : 'Tất cả extension từ Web Store đã là bản mới nhất.'
    })

  function scopeText(e: Extension): string {
    if (e.scope === 'all') return 'Tất cả profile'
    if (e.scope === 'groups') {
      const names = e.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean)
      return names.length ? `Nhóm: ${names.join(', ')}` : 'Chưa chọn nhóm'
    }
    return e.profileIds.length ? `${e.profileIds.length} profile` : 'Chưa chọn profile'
  }

  const shown = extensions.filter(
    (e) => !search.trim() || e.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Extension</h1>
      </div>
      <div className="panel pad">
        <div className="subtabs">
          <button className={`subtab${subtab === 'team' ? ' active' : ''}`} onClick={() => setSubtab('team')}>
            Của tôi
          </button>
          <button className={`subtab${subtab === 'recommended' ? ' active' : ''}`} onClick={() => setSubtab('recommended')}>
            Gợi ý
          </button>
        </div>

        {subtab === 'recommended' && (
          <div className="coming-soon">
            <Hammer size={40} />
            <h4>Extension gợi ý</h4>
            <p>Danh mục extension được tuyển chọn. Tính năng chưa phát triển.</p>
          </div>
        )}

        {subtab === 'team' && (
          <>
            <form className="toolbar" onSubmit={addFromStore}>
              <button type="button" className="primary" disabled={!!busy} onClick={() => addFromFile('file')}>
                <Upload size={15} /> Thêm extension
              </button>
              <div className="search" style={{ width: 240 }}>
                <Search size={16} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm extension" />
              </div>
              <input
                style={{ flex: 1, minWidth: 220 }}
                value={storeInput}
                onChange={(e) => setStoreInput(e.target.value)}
                placeholder="Dán link Chrome Web Store hoặc ID extension"
              />
              <button type="submit" className="primary" disabled={!!busy || !storeInput.trim()}>
                <Store size={15} /> {busy === 'store' ? 'Đang tải…' : 'Từ Web Store'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => addFromFile('folder')}>
                <FolderPlus size={15} /> Từ thư mục
              </button>
              <button type="button" disabled={!!busy} onClick={checkUpdates}>
                <RefreshCw size={15} className={busy === 'check' ? 'spin' : undefined} /> Kiểm tra cập nhật
              </button>
              <div className="spacer" />
              <button type="button" className="icon" title="Phân loại" onClick={() => notYet('Phân loại extension')}>
                <LayoutGrid size={15} />
              </button>
            </form>

            <p className="note" style={{ margin: '0 0 14px' }}>
              Thay đổi có hiệu lực từ lần mở profile tiếp theo. Dữ liệu extension (ví, đăng nhập…) lưu riêng trong từng
              profile và được giữ khi cập nhật. Trang web có thể phát hiện một số extension, nên chỉ gán cho profile thật
              sự cần.
            </p>

            {error && (
              <div className="error-bar">
                <span>{error}</span>
                <button className="small ghost" onClick={() => setError(null)}>
                  Đóng
                </button>
              </div>
            )}
            {notice && (
              <div className="ok-bar" style={{ marginBottom: 14 }}>
                {notice}
              </div>
            )}

            {shown.length === 0 ? (
              <div className="empty">
                {extensions.length === 0
                  ? 'Chưa có extension. Dán link Chrome Web Store, hoặc thêm từ file / thư mục.'
                  : 'Không có extension khớp tìm kiếm.'}
              </div>
            ) : (
              <div className="ext-grid">
                {shown.map((e) => {
                  const isBusy = busy === e.id
                  const newVersion = updates[e.id]
                  return (
                    <div className="ext-card" key={e.id}>
                      <div className="ext-card-head">
                        {e.icon ? <img src={e.icon} alt="" /> : <div className="ext-icon-ph" />}
                        <div className="ext-card-title">
                          <div className="name">
                            {e.name}
                            <span className="muted small-text">{e.version}</span>
                            <span className="tag">{e.source === 'store' ? 'Web Store' : 'File'}</span>
                            {newVersion && <span className="tag warn">có bản {newVersion}</span>}
                          </div>
                          <div className="muted small-text">Áp dụng: {scopeText(e)}</div>
                        </div>
                        <button
                          className={`switch${e.enabled ? ' on' : ''}`}
                          disabled={isBusy}
                          title={e.enabled ? 'Đang bật' : 'Đang tắt'}
                          onClick={() => run(e.id, async () => void (await call(isola().extensions.update(e.id, { enabled: !e.enabled }))))}
                        />
                      </div>
                      {e.description && <div className="ext-card-desc">{e.description}</div>}
                      <div className="ext-card-foot">
                        <span className="badge-available">
                          <CheckCircle2 size={13} /> Sẵn sàng
                        </span>
                        <span className="spacer" />
                        <button className="small" onClick={() => setScopeOf(e)}>
                          Phạm vi
                        </button>
                        <Menu
                          trigger={(toggle) => (
                            <button className="icon small ghost" onClick={toggle} title="Thêm">
                              <MoreVertical size={16} />
                            </button>
                          )}
                          items={[
                            {
                              label: 'Phạm vi áp dụng',
                              onClick: () => setScopeOf(e)
                            },
                            e.source === 'store'
                              ? {
                                  label: 'Cập nhật từ Web Store',
                                  icon: <RefreshCw size={14} />,
                                  onClick: () =>
                                    run(e.id, async () => {
                                      const u = await call(isola().extensions.updateFromStore(e.id))
                                      setUpdates(({ [e.id]: _, ...rest }) => rest)
                                      return u.version === e.version
                                        ? `${u.name} đã là bản mới nhất.`
                                        : `Đã cập nhật ${u.name} lên ${u.version}.`
                                    })
                                }
                              : {
                                  label: 'Cập nhật từ file',
                                  icon: <FilePlus size={14} />,
                                  onClick: () =>
                                    run(e.id, async () => {
                                      const u = await call(isola().extensions.updateFromFile(e.id, 'file'))
                                      return u ? `Đã cập nhật ${u.name} lên ${u.version}.` : null
                                    })
                                },
                            'divider',
                            {
                              label: 'Xóa khỏi Isola',
                              danger: true,
                              onClick: () => {
                                if (!confirm(`Xóa extension "${e.name}" khỏi Isola? Dữ liệu của nó trong các profile vẫn được giữ.`)) return
                                run(e.id, async () => void (await call(isola().extensions.remove(e.id))))
                              }
                            }
                          ]}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {scopeOf && (
        <ExtensionScopeDialog
          extension={scopeOf}
          groups={groups}
          profiles={profiles}
          onClose={() => setScopeOf(null)}
          onSaved={() => {
            setScopeOf(null)
            reload()
          }}
        />
      )}
    </>
  )
}
