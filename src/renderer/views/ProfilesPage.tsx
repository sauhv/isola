'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Group, Profile, ProfileFilter, Proxy, Tag } from '../../shared/types'
import { call, isola } from '../lib/isola'
import GroupsDialog from './GroupsDialog'
import ProfileEditor from './ProfileEditor'

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [filter, setFilter] = useState<ProfileFilter>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)
  const [groupsOpen, setGroupsOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [p, g, t, x] = await Promise.all([
        call(isola().profiles.list(filter)),
        call(isola().groups.list()),
        call(isola().tags.list()),
        call(isola().proxies.list())
      ])
      setProfiles(p)
      setGroups(g)
      setTags(t)
      setProxies(x)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [filter])

  useEffect(() => {
    reload()
  }, [reload])

  // Trạng thái chạy/dừng do main đẩy xuống, kể cả khi người dùng tự đóng cửa sổ Chrome.
  useEffect(
    () =>
      isola().onProfileStatus(({ id, status }) =>
        setProfiles((list) => list.map((p) => (p.id === id ? { ...p, status } : p)))
      ),
    []
  )

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy((s) => new Set(s).add(id))
    setError(null)
    try {
      await action()
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

  const archived = !!filter.archived

  return (
    <>
      <h1 className="page-title">{archived ? 'Profile đã lưu trữ' : 'Profile'}</h1>

      <div className="toolbar">
        <input
          placeholder="Tìm theo tên"
          value={filter.search ?? ''}
          onChange={(e) => setFilter({ ...filter, search: e.target.value || undefined })}
        />
        <select
          value={filter.groupId ?? ''}
          onChange={(e) => setFilter({ ...filter, groupId: e.target.value || undefined })}
        >
          <option value="">Mọi nhóm</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.profileCount})
            </option>
          ))}
        </select>
        <select value={filter.tagId ?? ''} onChange={(e) => setFilter({ ...filter, tagId: e.target.value || undefined })}>
          <option value="">Mọi tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setFilter({ ...filter, archived: e.target.checked || undefined })}
          />
          Đã lưu trữ
        </label>
        <div className="spacer" />
        <button onClick={() => setGroupsOpen(true)}>Nhóm</button>
        <button className="primary" onClick={() => setEditing('new')}>
          Tạo profile
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
              <th>#</th>
              <th>Tên</th>
              <th>Nhóm</th>
              <th>Tag</th>
              <th>Proxy</th>
              <th>Kernel</th>
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const isBusy = busy.has(p.id)
              const running = p.status === 'running'
              return (
                <tr key={p.id}>
                  <td className="muted">{p.serial}</td>
                  <td>
                    {p.name}
                    {p.lab && <span className="tag">lab</span>}
                  </td>
                  <td>{p.groupName ?? <span className="muted">—</span>}</td>
                  <td>
                    {p.tags.map((t) => (
                      <span key={t.id} className="tag">
                        {t.name}
                      </span>
                    ))}
                  </td>
                  <td>{p.proxyHost ?? <span className="muted">—</span>}</td>
                  <td className="muted">{p.kernel}</td>
                  <td>
                    <span className={`status ${p.status}`}>
                      {running ? 'Đang chạy' : archived ? 'Lưu trữ' : 'Đã đóng'}
                    </span>
                  </td>
                  <td className="actions">
                    {archived ? (
                      <>
                        <button
                          className="small"
                          disabled={isBusy}
                          onClick={() => run(p.id, () => call(isola().profiles.restore(p.id)).then(reload))}
                        >
                          Khôi phục
                        </button>
                        <button
                          className="small danger"
                          disabled={isBusy}
                          onClick={() => {
                            if (!confirm(`Xóa vĩnh viễn "${p.name}" cùng toàn bộ dữ liệu trình duyệt? Không hoàn tác được.`))
                              return
                            run(p.id, () => call(isola().profiles.purge(p.id, true)).then(reload))
                          }}
                        >
                          Xóa vĩnh viễn
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`small${running ? '' : ' primary'}`}
                          disabled={isBusy}
                          onClick={() =>
                            run(p.id, () => call(running ? isola().profiles.stop(p.id) : isola().profiles.start(p.id)))
                          }
                        >
                          {isBusy ? '…' : running ? 'Đóng' : 'Mở'}
                        </button>
                        <button className="small" disabled={isBusy} onClick={() => setEditing(p)}>
                          Sửa
                        </button>
                        <button
                          className="small"
                          disabled={isBusy || running}
                          onClick={() => {
                            if (!confirm(`Lưu trữ "${p.name}"? Dữ liệu trình duyệt được giữ lại.`)) return
                            run(p.id, () => call(isola().profiles.archive(p.id)).then(reload))
                          }}
                        >
                          Lưu trữ
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {profiles.length === 0 && (
          <div className="empty">{archived ? 'Không có profile lưu trữ.' : 'Chưa có profile nào. Bấm "Tạo profile".'}</div>
        )}
      </div>

      {editing && (
        <ProfileEditor
          profile={editing === 'new' ? null : editing}
          groups={groups}
          proxies={proxies}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {groupsOpen && (
        <GroupsDialog
          groups={groups}
          onChanged={reload}
          onClose={() => {
            setGroupsOpen(false)
            reload()
          }}
        />
      )}
    </>
  )
}
