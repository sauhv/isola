'use client'

import { useState, type FormEvent } from 'react'
import type { Group } from '../../shared/types'
import { call, isola } from '../lib/isola'

interface Props {
  groups: Group[]
  onChanged: () => void
  onClose: () => void
}

export default function GroupsDialog({ groups, onChanged, onClose }: Props) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  function saveRename() {
    if (!renaming?.name.trim()) return
    const { id, name } = renaming
    act(() => call(isola().groups.rename(id, name)).then(() => setRenaming(null)))
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function create(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    act(() => call(isola().groups.create(newName)).then(() => setNewName('')))
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>Nhóm</h2>
        {error && <div className="error-bar">{error}</div>}
        <form className="toolbar" onSubmit={create}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên nhóm mới" maxLength={100} />
          <button type="submit" className="primary" disabled={!newName.trim()}>
            Thêm
          </button>
        </form>
        <div className="table-wrap">
          <table>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>
                    {renaming?.id === g.id ? (
                      <input
                        autoFocus
                        value={renaming.name}
                        maxLength={100}
                        onChange={(e) => setRenaming({ id: g.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setRenaming(null)
                          if (e.key === 'Enter') saveRename()
                        }}
                      />
                    ) : (
                      g.name
                    )}
                  </td>
                  <td className="muted">{g.profileCount} profile</td>
                  <td className="actions">
                    {renaming?.id === g.id ? (
                      <button className="small primary" onClick={saveRename} disabled={!renaming.name.trim()}>
                        Lưu
                      </button>
                    ) : (
                      <button className="small" onClick={() => setRenaming({ id: g.id, name: g.name })}>
                        Đổi tên
                      </button>
                    )}
                    <button
                      className="small danger"
                      onClick={() => {
                        if (confirm(`Xóa nhóm "${g.name}"? Profile trong nhóm chuyển về "Không nhóm".`))
                          act(() => call(isola().groups.remove(g.id)))
                      }}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length === 0 && <div className="empty">Chưa có nhóm.</div>}
        </div>
        <div className="dialog-actions">
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}
