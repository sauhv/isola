'use client'

import { useCallback, useEffect, useState } from 'react'
import type { KernelInfo, KernelProgress } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`

export default function KernelsPage() {
  const { t } = useI18n()
  const [kernels, setKernels] = useState<KernelInfo[]>([])
  const [progress, setProgress] = useState<Record<string, KernelProgress>>({})
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    call(isola().kernels.list())
      .then(setKernels)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(reload, [reload])
  useEffect(() => isola().onKernelProgress((p) => setProgress((s) => ({ ...s, [p.id]: p }))), [])

  async function installKernel(id: string) {
    setError(null)
    setInstalling((s) => new Set(s).add(id))
    try {
      await call(isola().kernels.install(id))
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInstalling((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Kernel</h1>
      </div>
      <div className="panel pad">
      <p className="note">{t('kernel.note')}</p>
      {error && <div className="error-bar">{error}</div>}
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Kernel</th>
              <th>{t('common.version')}</th>
              <th>{t('common.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kernels.map((k) => {
              const p = progress[k.id]
              const busy = installing.has(k.id)
              return (
                <tr key={k.id}>
                  <td>{k.id}</td>
                  <td className="muted">{k.buildId}</td>
                  <td>
                    {k.installed ? (
                      <span className="status running">{t('kernel.installed')}</span>
                    ) : busy && p && p.totalBytes > 0 ? (
                      <span className="status">
                        <span className="progress">
                          <div style={{ width: `${(100 * p.downloadedBytes) / p.totalBytes}%` }} />
                        </span>
                        {mb(p.downloadedBytes)} / {mb(p.totalBytes)}
                      </span>
                    ) : (
                      <span className="status">{busy ? t('kernel.downloading') : t('kernel.notInstalled')}</span>
                    )}
                  </td>
                  <td className="actions">
                    {!k.installed && (
                      <button className="small primary" disabled={busy} onClick={() => installKernel(k.id)}>
                        {t('kernel.download')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </div>
    </>
  )
}
