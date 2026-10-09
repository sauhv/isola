'use client'

import { RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '../../../shared/types'
import { runBatch } from '../../lib/batch'
import { formatDate } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'

const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export default function TrashTab() {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    call(isola().profiles.list({ archived: true }))
      .then((list) => {
        setProfiles(list)
        setSelected((s) => new Set([...s].filter((id) => list.some((p) => p.id === id))))
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(reload, [reload])

  async function bulk(list: Profile[], fn: (p: Profile) => Promise<unknown>) {
    setBusy(true)
    setError(null)
    setError(await runBatch(list, (p) => p.name, fn))
    setBusy(false)
    reload()
  }

  const restore = (list: Profile[]) => bulk(list, (p) => call(isola().profiles.restore(p.id)))
  const purge = (list: Profile[]) => {
    if (!confirm(t('trash.confirmPurge', { n: list.length })))
      return
    bulk(list, (p) => call(isola().profiles.purge(p.id, true)))
  }

  const chosen = profiles.filter((p) => selected.has(p.id))
  const all = profiles.length > 0 && chosen.length === profiles.length

  return (
    <>
      <div className="toolbar">
        <button disabled={busy || chosen.length === 0} onClick={() => restore(chosen)}>
          <RotateCcw size={15} /> {t('common.restore')}
        </button>
        <button className="danger" disabled={busy || chosen.length === 0} onClick={() => purge(chosen)}>
          <Trash2 size={15} /> {t('common.purge')}
        </button>
        <span className="muted">{t('trash.note')}</span>
      </div>

      {error && <div className="error-bar">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(profiles.map((p) => p.id)))}
                />
              </th>
              <th>{t('common.no')}</th>
              <th>ID</th>
              <th>{t('common.name')}</th>
              <th>{t('common.group')}</th>
              <th>{t('trash.colTrashed')}</th>
              <th>{t('trash.colAutoPurge')}</th>
              <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className={selected.has(p.id) ? 'selected' : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() =>
                      setSelected((s) => {
                        const next = new Set(s)
                        if (next.has(p.id)) next.delete(p.id)
                        else next.add(p.id)
                        return next
                      })
                    }
                  />
                </td>
                <td>{p.serial}</td>
                <td className="mono muted" title={p.id}>
                  {p.id.slice(0, 8)}
                </td>
                <td>{p.name}</td>
                <td>{p.groupName ?? <span className="muted">—</span>}</td>
                <td className="muted">{formatDate(p.deletedAt)}</td>
                <td className="muted">
                  {p.deletedAt ? formatDate(new Date(Date.parse(p.deletedAt) + PURGE_AFTER_MS).toISOString()) : ''}
                </td>
                <td className="actions">
                  <div>
                    <button className="small" disabled={busy} onClick={() => restore([p])}>
                      <RotateCcw size={13} /> {t('common.restore')}
                    </button>
                    <button className="small danger" disabled={busy} onClick={() => purge([p])}>
                      <Trash2 size={13} /> {t('common.purge')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {profiles.length === 0 && <div className="empty">{t('trash.empty')}</div>}
      </div>
    </>
  )
}
