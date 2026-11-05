'use client'

import { Download, FolderOpen, RefreshCw, Save, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SettingsInfo, UpdateStatus } from '../../shared/types'
import LangSwitcher from '../components/LangSwitcher'
import { formatDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'
import { toast } from '../lib/toast'

function fmtSize(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

export default function SettingsPage() {
  const { t } = useI18n()
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [upd, setUpd] = useState<UpdateStatus | null>(null)

  const reload = useCallback(async () => {
    try {
      setInfo(await call(isola().settings.info()))
    } catch {
      /* bỏ qua */
    }
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const backupNow = () =>
    run('backup', async () => {
      const r = await call(isola().settings.backupNow())
      setInfo((i) => (i ? { ...i, backups: r.backups } : i))
      toast(t('set.backupDone'), 'success')
    })
  const checkUpdate = () =>
    run('update', async () => {
      const r = await call(isola().settings.checkUpdate())
      setUpd(r)
    })
  const exportAll = () =>
    run('exportAll', async () => {
      const list = await call(isola().profiles.list())
      if (list.length === 0) return toast(t('set.noProfiles'), 'info')
      if (!confirm(t('pt.exportWarn', { n: list.length }))) return
      const r = await call(isola().profiles.exportProfiles(list.map((p) => p.id)))
      if (r.saved) toast(t('pt.exportedProfiles', { n: r.count }), 'success')
    })

  const updText: Record<UpdateStatus, string> = {
    dev: t('set.updDev'),
    available: t('set.updAvailable'),
    latest: t('set.updLatest'),
    error: t('set.updError')
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">{t('set.title')}</h1>
      </div>

      <div className="panel" style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Ngôn ngữ */}
        <section>
          <h3 className="set-h">{t('set.language')}</h3>
          <LangSwitcher />
        </section>

        {/* Phiên bản & cập nhật */}
        <section>
          <h3 className="set-h">{t('set.version')}</h3>
          <div className="row-line">
            <span className="mono">Isola v{info?.version ?? '…'}</span>
            <button className="small" disabled={busy === 'update'} onClick={checkUpdate}>
              <RefreshCw size={14} /> {t('set.checkUpdate')}
            </button>
            {upd && <span className="muted">{updText[upd]}</span>}
          </div>
          {info?.pendingUpdate && (
            <div className="row-line" style={{ marginTop: 8 }}>
              <button className="small primary" disabled={busy === 'install'} onClick={() => run('install', () => call(isola().settings.installUpdate()))}>
                {t('set.installPending', { v: info.pendingUpdate })}
              </button>
            </div>
          )}
        </section>

        {/* Dữ liệu & sao lưu */}
        <section>
          <h3 className="set-h">{t('set.data')}</h3>
          <div className="row-line">
            <span className="mono muted" style={{ wordBreak: 'break-all', flex: 1 }}>
              {info?.dataRoot ?? '…'}
            </span>
            <button className="small" onClick={() => call(isola().settings.openDataFolder())}>
              <FolderOpen size={14} /> {t('set.openFolder')}
            </button>
          </div>
          <div className="row-line" style={{ marginTop: 8 }}>
            <button className="small primary" disabled={busy === 'backup'} onClick={backupNow}>
              <Save size={14} /> {t('set.backupNow')}
            </button>
            <button className="small" onClick={() => call(isola().settings.openBackupsFolder())}>
              <FolderOpen size={14} /> {t('set.openBackups')}
            </button>
            <span className="muted">{t('set.backupCount', { n: info?.backups.length ?? 0 })}</span>
          </div>
          {info && info.backups.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t('set.backupLatest')}: <span className="mono">{formatDate(info.backups[0].at)}</span> ·{' '}
              {fmtSize(info.backups[0].size)}
            </div>
          )}
        </section>

        {/* Nhập / xuất toàn bộ */}
        <section>
          <h3 className="set-h">{t('set.transfer')}</h3>
          <div className="row-line">
            <button className="small" disabled={busy === 'exportAll'} onClick={exportAll}>
              <Upload size={14} /> {t('set.exportAll')}
            </button>
            <button className="small" onClick={() => run('import', async () => {
              const r = await call(isola().profiles.importProfiles())
              if (r) toast(r.warnings.length ? t('pt.importedWarn', { n: r.imported, w: r.warnings.length }) : t('pt.imported', { n: r.imported }), r.warnings.length ? 'info' : 'success')
            })}>
              <Download size={14} /> {t('pt.import')}
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
