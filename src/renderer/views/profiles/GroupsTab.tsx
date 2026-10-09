'use client'

import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Group } from '../../../shared/types'
import { formatDate } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'

export default function GroupsTab() {
  const { t } = useI18n()
  const [groups, setGroups] = useState<Group[]>([])
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    call(isola().groups.list())
      .then(setGroups)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(reload, [reload])

  async function act(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function create(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    act(() => call(isola().groups.create(newName)).then(() => setNewName('')))
  }

  function saveRename() {
    if (!renaming?.name.trim()) return
    const { id, name } = renaming
    act(() => call(isola().groups.rename(id, name)).then(() => setRenaming(null)))
  }

  return (
    <>
      <form className="toolbar" onSubmit={create}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('groups.newName')}
          maxLength={100}
          style={{ width: 280 }}
        />
        <button type="submit" className="primary" disabled={!newName.trim()}>
          <Plus size={15} /> {t('groups.add')}
        </button>
      </form>

      {error && <div className="error-bar">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('groups.colName')}</th>
              <th>{t('groups.colCount')}</th>
              <th>{t('groups.colCreated')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
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
                <td>{g.profileCount}</td>
                <td className="muted">{formatDate(g.createdAt)}</td>
                <td className="actions">
                  <div>
                    {renaming?.id === g.id ? (
                      <>
                        <button className="small primary" onClick={saveRename} disabled={!renaming.name.trim()}>
                          <Check size={14} /> {t('common.save')}
                        </button>
                        <button className="small" onClick={() => setRenaming(null)}>
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button className="small" onClick={() => setRenaming({ id: g.id, name: g.name })}>
                        <Pencil size={13} /> {t('common.rename')}
                      </button>
                    )}
                    <button
                      className="small danger"
                      onClick={() => {
                        if (confirm(t('groups.confirmDelete', { name: g.name, n: g.profileCount })))
                          act(() => call(isola().groups.remove(g.id)))
                      }}
                    >
                      <Trash2 size={13} /> {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <div className="empty">{t('groups.empty')}</div>}
      </div>
    </>
  )
}
