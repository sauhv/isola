'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ActivityEntry } from '../../shared/types'
import { formatDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'

/** Rút gọn phần chi tiết JSON để hiển thị (ẩn các khóa dài/ít ý nghĩa). */
function shortDetail(action: string, raw: string): { text: string; error?: string } {
  let d: Record<string, unknown> = {}
  try {
    d = JSON.parse(raw)
  } catch {
    return { text: '' }
  }
  if (action === 'launch_failed') return { text: '', error: String(d.error ?? '') }
  const parts: string[] = []
  if (d.kernel) parts.push(String(d.kernel))
  if (d.catalogId) parts.push(String(d.catalogId))
  if (d.timezone) parts.push(String(d.timezone))
  if (typeof d.extensions === 'number' && d.extensions) parts.push(`${d.extensions} ext`)
  if (typeof d.cookies === 'number' && d.cookies) parts.push(`${d.cookies} cookie`)
  if (d.serial) parts.push(`#${d.serial}`)
  return { text: parts.join(' · ') }
}

export default function ActivityPage() {
  const { t } = useI18n()
  const [rows, setRows] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await call(isola().activity.list()))
    } catch {
      /* bỏ qua */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('act.title')}</h1>
        <span className="spacer" />
        <button className="icon" title={t('common.reload')} onClick={reload}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="panel">
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 20 }}>
            {loading ? '…' : t('act.empty')}
          </div>
        ) : (
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 150 }}>{t('act.time')}</th>
                <th style={{ width: 220 }}>Profile</th>
                <th style={{ width: 150 }}>{t('act.action')}</th>
                <th>{t('act.detail')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const sd = shortDetail(r.action, r.detail)
                const failed = r.action === 'launch_failed'
                return (
                  <tr key={i}>
                    <td className="mono muted">{formatDate(r.at)}</td>
                    <td>
                      {r.serial != null ? (
                        <>
                          <span className="muted">#{r.serial}</span> {r.profileName}
                        </>
                      ) : (
                        <span className="muted">{r.profileId ? t('act.deleted') : '—'}</span>
                      )}
                    </td>
                    <td>
                      <span className={failed ? 'tag danger' : 'tag'} style={{ margin: 0 }}>
                        {failed && <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />}
                        {t(`act.a.${r.action}`)}
                      </span>
                    </td>
                    <td className="mono muted">
                      {sd.error ? <span style={{ color: 'var(--danger)' }}>{sd.error}</span> : sd.text}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  )
}
