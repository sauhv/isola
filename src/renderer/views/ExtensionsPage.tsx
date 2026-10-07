'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Extension, Group, Profile } from '../../shared/types'
import { call, isola } from '../lib/isola'
import ExtensionScopeDialog from './ExtensionScopeDialog'

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<Extension[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [updates, setUpdates] = useState<Record<string, string>>({})
  const [storeInput, setStoreInput] = useState('')
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

  /** Chạy một thao tác, hiện lỗi hoặc thông báo, rồi tải lại danh sách. */
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
      return names.length ? `Nhóm: ${names.join(', ')}` : 'Chưa chọn nhóm nào'
    }
    return e.profileIds.length ? `${e.profileIds.length} profile` : 'Chưa chọn profile nào'
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Extension</h1>
      </div>
      <div className="panel pad">

      <form className="toolbar" onSubmit={addFromStore}>
        <input
          style={{ flex: 1, minWidth: 280 }}
          value={storeInput}
          onChange={(e) => setStoreInput(e.target.value)}
          placeholder="Dán link Chrome Web Store hoặc ID extension"
        />
        <button type="submit" className="primary" disabled={!!busy || !storeInput.trim()}>
          {busy === 'store' ? 'Đang tải…' : 'Thêm từ Web Store'}
        </button>
        <button type="button" disabled={!!busy} onClick={() => addFromFile('file')}>
          Từ file .crx/.zip
        </button>
        <button type="button" disabled={!!busy} onClick={() => addFromFile('folder')}>
          Từ thư mục
        </button>
        <button type="button" disabled={!!busy} onClick={checkUpdates}>
          {busy === 'check' ? 'Đang kiểm…' : 'Kiểm tra cập nhật'}
        </button>
      </form>

      <p className="note" style={{ margin: '0 0 12px' }}>
        Thay đổi có hiệu lực từ lần mở profile tiếp theo. Dữ liệu của extension (ví, đăng nhập…) lưu riêng trong từng
        profile và được giữ khi cập nhật. Trang web có thể phát hiện một số extension, nên chỉ gán extension cho profile
        thật sự cần.
      </p>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button className="small" onClick={() => setError(null)}>
            Đóng
          </button>
        </div>
      )}
      {notice && <div className="ok-bar" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Extension</th>
              <th>Quyền</th>
              <th>Áp dụng cho</th>
              <th>Bật</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {extensions.map((e) => {
              const isBusy = busy === e.id
              const newVersion = updates[e.id]
              return (
                <tr key={e.id}>
                  <td className="wrap">
                    <div className="ext-cell">
                      {e.icon ? <img src={e.icon} alt="" width={28} height={28} /> : <div className="ext-icon-ph" />}
                      <div>
                        <div>
                          {e.name} <span className="muted">{e.version}</span>{' '}
                          <span className="tag">{e.source === 'store' ? 'Web Store' : 'File'}</span>
                          {newVersion && <span className="tag warn">có bản {newVersion}</span>}
                        </div>
                        {e.description && <div className="muted small-text">{e.description}</div>}
                        <div className="muted small-text mono">{e.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="wrap small-text" title={e.permissions.join('\n')}>
                    {e.permissions.length === 0 ? (
                      <span className="muted">Không</span>
                    ) : (
                      <>
                        {e.permissions.slice(0, 3).join(', ')}
                        {e.permissions.length > 3 && <span className="muted"> +{e.permissions.length - 3}</span>}
                      </>
                    )}
                  </td>
                  <td>
                    <button className="link" onClick={() => setScopeOf(e)}>
                      {scopeText(e)}
                    </button>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={e.enabled}
                      disabled={isBusy}
                      onChange={(ev) =>
                        run(e.id, async () => void (await call(isola().extensions.update(e.id, { enabled: ev.target.checked }))))
                      }
                    />
                  </td>
                  <td className="actions">
                    {e.source === 'store' ? (
                      <button
                        className={`small${newVersion ? ' primary' : ''}`}
                        disabled={!!busy}
                        onClick={() =>
                          run(e.id, async () => {
                            const u = await call(isola().extensions.updateFromStore(e.id))
                            setUpdates(({ [e.id]: _, ...rest }) => rest)
                            return u.version === e.version ? `${u.name} đã là bản mới nhất.` : `Đã cập nhật ${u.name} lên ${u.version}.`
                          })
                        }
                      >
                        {isBusy ? '…' : 'Cập nhật'}
                      </button>
                    ) : (
                      <button
                        className="small"
                        disabled={!!busy}
                        title="Chọn file .crx/.zip bản mới. ID extension được giữ nguyên."
                        onClick={() =>
                          run(e.id, async () => {
                            const u = await call(isola().extensions.updateFromFile(e.id, 'file'))
                            return u ? `Đã cập nhật ${u.name} lên ${u.version}.` : null
                          })
                        }
                      >
                        Cập nhật từ file
                      </button>
                    )}
                    <button
                      className="small danger"
                      disabled={!!busy}
                      onClick={() => {
                        if (!confirm(`Xóa extension "${e.name}" khỏi Isola? Dữ liệu của nó trong các profile vẫn được giữ.`)) return
                        run(e.id, async () => void (await call(isola().extensions.remove(e.id))))
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
        {extensions.length === 0 && (
          <div className="empty">Chưa có extension. Dán link Chrome Web Store ở trên, hoặc thêm từ file.</div>
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
      </div>
    </>
  )
}
