'use client'

import { CheckCircle2, FilePlus, FolderPlus, Hammer, LayoutGrid, MoreVertical, RefreshCw, Search, Store, Upload } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Extension, Group, Profile } from '../../shared/types'
import Menu from '../components/Menu'
import { useI18n } from '../lib/i18n'
import { call, isola } from '../lib/isola'
import { notYet } from '../lib/toast'
import ExtensionScopeDialog from './ExtensionScopeDialog'

type SubTab = 'team' | 'recommended'

export default function ExtensionsPage() {
  const { t } = useI18n()
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
      return t('ext.added', { name: ext.name, ver: ext.version })
    })
  }

  const addFromFile = (kind: 'file' | 'folder') =>
    run(kind, async () => {
      const ext = await call(isola().extensions.addFromFile(kind))
      return ext ? t('ext.added', { name: ext.name, ver: ext.version }) : null
    })

  const checkUpdates = () =>
    run('check', async () => {
      const list = await call(isola().extensions.checkUpdates())
      const found = Object.fromEntries(list.filter((u) => u.latest).map((u) => [u.id, u.latest!]))
      setUpdates(found)
      const n = Object.keys(found).length
      return n ? t('ext.foundUpdates', { n }) : t('ext.allLatest')
    })

  function scopeText(e: Extension): string {
    if (e.scope === 'all') return t('extscope.all')
    if (e.scope === 'groups') {
      const names = e.groupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean)
      return names.length ? t('ext.scopeGroups', { names: names.join(', ') }) : t('ext.scopeNoGroup')
    }
    return e.profileIds.length ? t('ext.scopeNProfiles', { n: e.profileIds.length }) : t('ext.scopeNoProfile')
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
            {t('ext.tabMine')}
          </button>
          <button className={`subtab${subtab === 'recommended' ? ' active' : ''}`} onClick={() => setSubtab('recommended')}>
            {t('ext.tabRecommended')}
          </button>
        </div>

        {subtab === 'recommended' && (
          <div className="coming-soon">
            <Hammer size={40} />
            <h4>{t('ext.soonTitle')}</h4>
            <p>{t('ext.soonDesc')}</p>
          </div>
        )}

        {subtab === 'team' && (
          <>
            <form className="toolbar" onSubmit={addFromStore}>
              <button type="button" className="primary" disabled={!!busy} onClick={() => addFromFile('file')}>
                <Upload size={15} /> {t('ext.add')}
              </button>
              <div className="search" style={{ width: 240 }}>
                <Search size={16} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ext.searchPh')} />
              </div>
              <input
                style={{ flex: 1, minWidth: 220 }}
                value={storeInput}
                onChange={(e) => setStoreInput(e.target.value)}
                placeholder={t('ext.storePh')}
              />
              <button type="submit" className="primary" disabled={!!busy || !storeInput.trim()}>
                <Store size={15} /> {busy === 'store' ? t('common.loading') : t('ext.fromStore')}
              </button>
              <button type="button" disabled={!!busy} onClick={() => addFromFile('folder')}>
                <FolderPlus size={15} /> {t('ext.fromFolder')}
              </button>
              <button type="button" disabled={!!busy} onClick={checkUpdates}>
                <RefreshCw size={15} className={busy === 'check' ? 'spin' : undefined} /> {t('ext.checkUpdates')}
              </button>
              <div className="spacer" />
              <button type="button" className="icon" title={t('ext.categorize')} onClick={() => notYet(t('ext.categorizeExt'))}>
                <LayoutGrid size={15} />
              </button>
            </form>

            <p className="note" style={{ margin: '0 0 14px' }}>
              {t('ext.note')}
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
                  ? t('ext.emptyNone')
                  : t('ext.emptySearch')}
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
                            {newVersion && <span className="tag warn">{t('ext.hasNew', { v: newVersion })}</span>}
                          </div>
                          <div className="muted small-text">{t('ext.appliesTo', { s: scopeText(e) })}</div>
                        </div>
                        <button
                          className={`switch${e.enabled ? ' on' : ''}`}
                          disabled={isBusy}
                          title={e.enabled ? t('ext.enabledTitle') : t('ext.disabledTitle')}
                          onClick={() => run(e.id, async () => void (await call(isola().extensions.update(e.id, { enabled: !e.enabled }))))}
                        />
                      </div>
                      {e.description && <div className="ext-card-desc">{e.description}</div>}
                      <div className="ext-card-foot">
                        <span className="badge-available">
                          <CheckCircle2 size={13} /> {t('ext.ready')}
                        </span>
                        <span className="spacer" />
                        <button className="small" onClick={() => setScopeOf(e)}>
                          {t('ext.scope')}
                        </button>
                        <Menu
                          trigger={(toggle) => (
                            <button className="icon small ghost" onClick={toggle} title={t('ext.more')}>
                              <MoreVertical size={16} />
                            </button>
                          )}
                          items={[
                            {
                              label: t('ext.menuScope'),
                              onClick: () => setScopeOf(e)
                            },
                            e.source === 'store'
                              ? {
                                  label: t('ext.updateFromStore'),
                                  icon: <RefreshCw size={14} />,
                                  onClick: () =>
                                    run(e.id, async () => {
                                      const u = await call(isola().extensions.updateFromStore(e.id))
                                      setUpdates(({ [e.id]: _, ...rest }) => rest)
                                      return u.version === e.version
                                        ? t('ext.isLatest', { name: u.name })
                                        : t('ext.updated', { name: u.name, ver: u.version })
                                    })
                                }
                              : {
                                  label: t('ext.updateFromFile'),
                                  icon: <FilePlus size={14} />,
                                  onClick: () =>
                                    run(e.id, async () => {
                                      const u = await call(isola().extensions.updateFromFile(e.id, 'file'))
                                      return u ? t('ext.updated', { name: u.name, ver: u.version }) : null
                                    })
                                },
                            'divider',
                            {
                              label: t('ext.menuRemove'),
                              danger: true,
                              onClick: () => {
                                if (!confirm(t('ext.confirmRemove', { name: e.name }))) return
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
