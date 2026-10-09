'use client'

import { ArrowLeft, Cpu, Fingerprint, Globe, Layers, Loader2, Plus, RefreshCw, Shuffle, SlidersHorizontal, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CatalogOption,
  Group,
  KernelInfo,
  Profile,
  ProfileFingerprint,
  Proxy,
  ProxyCheck,
  ProxyType,
  Seed
} from '../../../shared/types'
import { countryName } from '../../lib/format'
import { currentLang, D, useI18n } from '../../lib/i18n'
import { call, isola } from '../../lib/isola'
import { notYet } from '../../lib/toast'

interface Props {
  /** null = tạo mới. */
  profile: Profile | null
  onClose: () => void
  onSaved: () => void
}

type ProxyMode = 'saved' | 'new' | 'none'
type TabId = 'general' | 'proxy' | 'platform' | 'fingerprint' | 'advanced'

const TABS: { id: TabId; key: string }[] = [
  { id: 'general', key: 'pf.tabGeneral' },
  { id: 'proxy', key: 'Proxy' },
  { id: 'platform', key: 'pf.tabPlatform' },
  { id: 'fingerprint', key: 'Fingerprint' },
  { id: 'advanced', key: 'pf.tabAdvanced' }
]
const TAB_ORDER: TabId[] = TABS.map((t) => t.id)
const TAB_LABEL = (tb: { key: string }, t: (k: string) => string) => (tb.key.includes('.') ? t(tb.key) : tb.key)

const PLATFORMS = ['facebook', 'tiktok', 'google', 'amazon', 'shopee', 'instagram', 'twitter', 'telegram', 'discord']
const LANGUAGES = ['en-US', 'en-GB', 'vi-VN', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'th-TH', 'id-ID', 'ru-RU', 'it-IT', 'nl-NL', 'pl-PL', 'tr-TR']
const languagesFor = (l: string) => [...new Set([l, l.split('-')[0], 'en-US', 'en'])]

const splitLines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
const splitTags = (s: string) =>
  s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

function checkText(c: ProxyCheck | null | undefined): string {
  const tr = (k: string) => { const e = D[k]; return e ? (currentLang === 'vi' ? e[0] : e[1]) : k }
  if (!c) return tr('pf.notChecked')
  if (c.error) return tr('px.errPrefix').split('{e}').join(c.error)
  return [c.ip, c.country && `${c.country} - ${countryName(c.country)}`, c.city, c.timezone, c.latencyMs != null && `${c.latencyMs} ms`]
    .filter(Boolean)
    .join(' · ')
}

export default function ProfileFormPage({ profile, onClose, onSaved }: Props) {
  const { t } = useI18n()
  const editing = !!profile

  // ---- dữ liệu nền ----
  const [groups, setGroups] = useState<Group[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [kernels, setKernels] = useState<KernelInfo[]>([])

  // ---- thông tin chung ----
  const [name, setName] = useState(profile?.name ?? '')
  const [groupId, setGroupId] = useState(profile?.groupId ?? '')
  const [platform, setPlatform] = useState(profile?.platform ?? '')
  const [tags, setTags] = useState(profile?.tags.map((t) => t.name).join(', ') ?? '')
  const [startUrls, setStartUrls] = useState(profile?.startUrls.join('\n') ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [notes, setNotes] = useState(profile?.notes ?? '')
  const [cookies, setCookies] = useState('')

  // ---- proxy ----
  const [proxyMode, setProxyMode] = useState<ProxyMode>(profile ? (profile.proxyId ? 'saved' : 'none') : 'saved')
  const [proxyId, setProxyId] = useState(profile?.proxyId ?? '')
  const [lab, setLab] = useState(profile?.lab ?? false)
  const [draft, setDraft] = useState({ type: 'http' as ProxyType, host: '', port: '', username: '', password: '' })
  const [draftCheck, setDraftCheck] = useState<ProxyCheck | null>(null)
  const [checking, setChecking] = useState(false)

  // ---- fingerprint ----
  const [fp, setFp] = useState<ProfileFingerprint | null>(profile?.fingerprint ?? null)
  const [fpDirty, setFpDirty] = useState(false)
  const [fpBusy, setFpBusy] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ---- tab / scroll-spy ----
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const bodyRef = useRef<HTMLDivElement>(null)
  const sectionRefs: Record<TabId, React.RefObject<HTMLElement | null>> = {
    general: useRef<HTMLElement>(null),
    proxy: useRef<HTMLElement>(null),
    platform: useRef<HTMLElement>(null),
    fingerprint: useRef<HTMLElement>(null),
    advanced: useRef<HTMLElement>(null)
  }

  function scrollTo(id: TabId) {
    setActiveTab(id)
    const c = bodyRef.current
    const el = sectionRefs[id].current
    if (!c || !el) return
    const top = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 8
    c.scrollTo({ top })
  }

  function onBodyScroll() {
    const c = bodyRef.current
    if (!c) return
    const threshold = c.getBoundingClientRect().top + 90
    let current: TabId = 'general'
    for (const id of TAB_ORDER) {
      const el = sectionRefs[id].current
      if (el && el.getBoundingClientRect().top <= threshold) current = id
    }
    setActiveTab(current)
  }

  useEffect(() => {
    Promise.all([
      call(isola().groups.list()),
      call(isola().proxies.list()),
      call(isola().fingerprints.catalog()),
      call(isola().kernels.list())
    ])
      .then(([g, p, c, k]) => {
        setGroups(g)
        setProxies(p)
        setCatalog(c)
        setKernels(k)
        if (!profile && p.length === 0) setProxyMode('new')
      })
      .catch((e) => setError(e.message))
    if (!profile?.fingerprint) newFingerprint(undefined, !!profile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Không proxy thì bắt buộc là profile lab.
  const effectiveLab = proxyMode === 'none' ? true : lab
  const seed = fp?.seed ?? null
  const device = catalog.find((c) => c.id === fp?.catalogId)
  const savedProxy = proxies.find((p) => p.id === proxyId)
  const hostOs = catalog[0]?.os
  const timeZones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
    } catch {
      return ['UTC']
    }
  }, [])

  async function newFingerprint(catalogId?: string, markDirty = true) {
    setFpBusy(true)
    try {
      const next = await call(
        isola().fingerprints.preview({ catalogId, webrtc: seed?.webrtc, timezone: seed?.timezone, language: seed?.language })
      )
      setFp(next)
      if (markDirty) setFpDirty(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFpBusy(false)
    }
  }

  function patchSeed(patch: Partial<Seed>) {
    if (!fp) return
    setFp({ ...fp, seed: { ...fp.seed, ...patch } })
    setFpDirty(true)
  }

  async function testDraft() {
    setChecking(true)
    setDraftCheck(null)
    try {
      setDraftCheck(
        await call(
          isola().proxies.testDraft({
            type: draft.type,
            host: draft.host.trim(),
            port: Number(draft.port),
            username: draft.username || null,
            password: draft.password || null
          })
        )
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  async function testSaved() {
    if (!proxyId) return
    setChecking(true)
    try {
      const updated = await call(isola().proxies.test(proxyId))
      setProxies((list) => list.map((p) => (p.id === updated.id ? updated : p)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    setError(null)
    if (!name.trim()) return setError(t('pf.errName'))
    if (!fp) return setError(t('pf.errNoFp'))
    if (proxyMode === 'saved' && !proxyId) return setError(t('pf.errPickProxy'))
    if (proxyMode === 'new' && (!draft.host.trim() || !draft.port)) return setError(t('pf.errNewProxy'))
    if (editing && fpDirty && !confirm(t('pf.confirmFp'))) return

    setSaving(true)
    try {
      let finalProxyId: string | null = proxyMode === 'saved' ? proxyId : null
      if (proxyMode === 'new') {
        const created = await call(
          isola().proxies.create({
            type: draft.type,
            host: draft.host.trim(),
            port: Number(draft.port),
            username: draft.username || null,
            password: draft.password || null
          })
        )
        finalProxyId = created.id
      }
      const fields = {
        name,
        groupId: groupId || null,
        proxyId: finalProxyId,
        platform: platform.trim() || null,
        tags: splitTags(tags),
        startUrls: splitLines(startUrls),
        username: username.trim() || null,
        notes: notes.trim() || null,
        lab: effectiveLab,
        ...(cookies.trim() ? { cookies } : {})
      }
      if (profile) {
        await call(isola().profiles.update(profile.id, fields))
        if (fpDirty) await call(isola().profiles.setFingerprint(profile.id, fp))
      } else {
        await call(isola().profiles.create({ ...fields, fingerprint: fp }))
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const timezoneText = effectiveLab
    ? seed?.timezone
    : proxyMode === 'saved'
      ? savedProxy?.lastCheck?.timezone
        ? t('pf.tzByProxyKnown', { tz: savedProxy.lastCheck.timezone })
        : t('pf.tzByProxyUnknown')
      : draftCheck?.timezone
        ? t('pf.tzByProxyKnown', { tz: draftCheck.timezone })
        : t('pf.tzByProxy')
  const proxyText =
    proxyMode === 'none'
      ? t('pf.pxNoneLab')
      : proxyMode === 'saved'
        ? savedProxy
          ? `${savedProxy.label} · ${checkText(savedProxy.lastCheck)}`
          : t('pf.pxNotChosen')
        : draft.host
          ? `${draft.type}://${draft.host}:${draft.port} (mới)`
          : t('pf.pxNew')

  // Công tắc "nhiễu phần cứng" kiểu AdsPower. on+disabled = Isola đang áp theo seed; notYet = chưa làm.
  const noiseSwitch = (label: string, on: boolean, done: boolean) => (
    <label className="checkbox" style={{ gap: 6 }}>
      <button
        type="button"
        className={`switch${on ? ' on' : ''}`}
        disabled={done}
        onClick={() => !done && notYet(t('pf.noiseFeat', { l: label }))}
        title={done ? t('pf.noiseBySeed') : undefined}
      />
      {label}
    </label>
  )

  return (
    <div className="form-page">
      <div className="form-page-head">
        <button className="icon ghost" onClick={onClose} title={t('common.back')}>
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title">{editing ? t('pf.titleEdit', { n: profile!.serial }) : t('app.create')}</h1>
        <span className="spacer" />
        <button onClick={onClose}>{t('common.cancel')}</button>
        <button className="primary" disabled={saving || !fp} onClick={save}>
          {saving && <Loader2 size={14} className="spin" />}
          {editing ? t('common.save') : t('app.create')}
        </button>
      </div>

      <div className="tabs form-tabs">
        {TABS.map((tb) => (
          <button key={tb.id} className={`tab${activeTab === tb.id ? ' active' : ''}`} onClick={() => scrollTo(tb.id)}>
            {TAB_LABEL(tb, t)}
          </button>
        ))}
      </div>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button className="small ghost" onClick={() => setError(null)}>
            Đóng
          </button>
        </div>
      )}

      <div className="form-page-body" ref={bodyRef} onScroll={onBodyScroll}>
        <div>
          {/* ---------- Chung ---------- */}
          <section className="card" id="general" ref={sectionRefs.general}>
            <h3>
              <User size={16} /> {t('pf.secGeneral')}
            </h3>
            <div className="row-field">
              <span className="row-label">{t('common.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={t('pf.namePh')} autoFocus />
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.browser')}</span>
              <select disabled style={{ width: 280 }}>
                {kernels.map((k) => (
                  <option key={k.id}>
                    Chrome for Testing {k.major}{k.installed ? '' : t('pf.notDownloaded')}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.os')}</span>
              <div className="seg">
                {(['windows', 'macos'] as const).map((os) => (
                  <button
                    key={os}
                    className={seed?.os === os ? 'active' : undefined}
                    disabled={hostOs !== os}
                    title={hostOs !== os ? t('pf.osTitle') : undefined}
                  >
                    {os === 'windows' ? 'Windows' : 'macOS'}
                  </button>
                ))}
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">User-Agent</span>
              <div className="inline-fields" style={{ flexWrap: 'nowrap' }}>
                <input value={seed?.userAgent ?? ''} readOnly style={{ flex: 1 }} className="mono small-text" />
                <button className="icon" title={t('pf.newFpTitle')} disabled={fpBusy} onClick={() => newFingerprint()}>
                  <RefreshCw size={15} className={fpBusy ? 'spin' : undefined} />
                </button>
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">{t('common.group')}</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">{t('common.noGroup')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-field">
              <span className="row-label">Tag</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('pf.tagsPh')} />
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.platform')}</span>
              <div className="inline-fields" style={{ flexWrap: 'nowrap' }}>
                <input
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  list="isola-platforms"
                  placeholder="facebook, tiktok…"
                  maxLength={50}
                  style={{ width: 200 }}
                />
                <datalist id="isola-platforms">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('pf.accountPh')} style={{ flex: 1 }} />
              </div>
            </div>
            <div className="row-field top">
              <span className="row-label">
                Cookie
                <span className="hint">{t('pf.cookieFmt')}</span>
              </span>
              <div>
                <textarea
                  rows={3}
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  spellCheck={false}
                  className="mono small-text"
                  style={{ width: '100%' }}
                  placeholder='[{"domain":".example.com","name":"sid","value":"…"}]'
                />
                <span className="hint">
                  {t('pf.cookieNote')}
                  {editing ? t('pf.cookieNoteEdit') : ''}
                </span>
              </div>
            </div>
            <div className="row-field top">
              <span className="row-label">{t('pf.notes')}</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </section>

          {/* ---------- Proxy ---------- */}
          <section className="card" id="proxy" ref={sectionRefs.proxy}>
            <h3>
              <Globe size={16} /> Proxy
            </h3>
            <div className="row-field">
              <span className="row-label">{t('pf.connType')}</span>
              <div className="seg">
                <button className={proxyMode === 'saved' ? 'active' : undefined} onClick={() => setProxyMode('saved')}>
                  {t('pf.pxSaved')}
                </button>
                <button className={proxyMode === 'new' ? 'active' : undefined} onClick={() => setProxyMode('new')}>
                  {t('pf.pxNewBtn')}
                </button>
                <button className={proxyMode === 'none' ? 'active' : undefined} onClick={() => setProxyMode('none')}>
                  {t('pf.pxNoneBtn')}
                </button>
              </div>
            </div>

            {proxyMode === 'saved' && (
              <div className="row-field top">
                <span className="row-label">{t('pf.pickProxy')}</span>
                <div>
                  <div className="inline-fields" style={{ flexWrap: 'nowrap' }}>
                    <select value={proxyId} onChange={(e) => setProxyId(e.target.value)} style={{ flex: 1 }}>
                      <option value="">{t('pf.pxChoose')}</option>
                      {proxies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} · {p.type}
                          {p.lastCheck && !p.lastCheck.error ? ` · ${p.lastCheck.ip} ${p.lastCheck.country ?? ''}` : ''}
                          {p.lastCheck?.error ? t('pf.pxErrSuffix') : ''}
                          {p.profileCount > 0 && p.id !== profile?.proxyId ? t('pf.pxInUse', { n: p.profileCount }) : ''}
                        </option>
                      ))}
                    </select>
                    <button disabled={!proxyId || checking} onClick={testSaved}>
                      {checking ? <Loader2 size={14} className="spin" /> : null} Kiểm tra
                    </button>
                  </div>
                  {savedProxy && (
                    <div className={`check-result ${savedProxy.lastCheck?.error ? 'status down' : 'muted'}`}>
                      {checkText(savedProxy.lastCheck)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {proxyMode === 'new' && (
              <>
                <div className="row-field">
                  <span className="row-label">{t('pf.typeHostPort')}</span>
                  <div className="inline-fields" style={{ flexWrap: 'nowrap' }}>
                    <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ProxyType })} style={{ width: 110 }}>
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                      <option value="socks5">SOCKS5</option>
                    </select>
                    <input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="Host" style={{ flex: 1 }} />
                    <input
                      value={draft.port}
                      onChange={(e) => setDraft({ ...draft, port: e.target.value.replace(/\D/g, '') })}
                      placeholder="Port"
                      style={{ width: 90 }}
                    />
                  </div>
                </div>
                <div className="row-field">
                  <span className="row-label">{t('pf.proxyAccount')}</span>
                  <div className="inline-fields" style={{ flexWrap: 'nowrap' }}>
                    <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="Username" style={{ flex: 1 }} autoComplete="off" />
                    <input
                      type="password"
                      value={draft.password}
                      onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                      placeholder="Password"
                      style={{ flex: 1 }}
                      autoComplete="new-password"
                    />
                    <button disabled={!draft.host || !draft.port || checking} onClick={testDraft}>
                      {checking ? <Loader2 size={14} className="spin" /> : null} Kiểm tra
                    </button>
                  </div>
                </div>
                {draftCheck && (
                  <div className="row-field">
                    <span />
                    <div className={`check-result ${draftCheck.error ? 'status down' : 'status running'}`}>{checkText(draftCheck)}</div>
                  </div>
                )}
                <div className="row-field">
                  <span />
                  <span className="hint">{t('pf.newProxyHint')}</span>
                </div>
              </>
            )}

            {proxyMode === 'none' ? (
              <div className="note">{t('pf.noProxyNote')}</div>
            ) : (
              <div className="row-field">
                <span />
                <label className="checkbox">
                  <input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
                  {t('pf.labCheckbox')}
                </label>
              </div>
            )}
          </section>

          {/* ---------- Nền tảng ---------- */}
          <section className="card" id="platform" ref={sectionRefs.platform}>
            <h3>
              <Layers size={16} /> {t('pf.secPlatform')}
            </h3>
            <div className="row-field">
              <span className="row-label">{t('pf.platformAccount')}</span>
              <button onClick={() => notYet(t('pf.addPlatformAccount'))}>
                <Plus size={15} /> {t('pf.addPlatformAccount')}
              </button>
            </div>
            <div className="row-field top">
              <span className="row-label">{t('pf.tabsOpen')}</span>
              <textarea rows={3} value={startUrls} onChange={(e) => setStartUrls(e.target.value)} placeholder={t('bc.startUrlsPh')} />
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.geolocation')}</span>
              <div className="seg">
                <button className="active">{t('pf.byIP')}</button>
                <button onClick={() => notYet(t('pf.customLocation'))}>{t('common.custom')}</button>
                <button onClick={() => notYet(t('pf.blockLocation'))}>{t('pf.block')}</button>
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.displayLang')}</span>
              <div className="seg">
                <button className="active">{t('pf.byLang')}</button>
                <button onClick={() => notYet(t('pf.customDisplayLang'))}>{t('common.custom')}</button>
              </div>
            </div>
          </section>

          {/* ---------- Fingerprint ---------- */}
          <section className="card" id="fingerprint" ref={sectionRefs.fingerprint}>
            <h3>
              <Fingerprint size={16} /> Fingerprint <span className="tag" style={{ marginLeft: 4 }}>compat</span>
            </h3>
            <div className="row-field">
              <span className="row-label">{t('pf.device')}</span>
              <select value={fp?.catalogId ?? ''} disabled={fpBusy} onChange={(e) => newFingerprint(e.target.value)}>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-field">
              <span className="row-label">WebRTC</span>
              <div className="seg">
                <button className={seed?.webrtc === 'replace' ? 'active' : undefined} onClick={() => patchSeed({ webrtc: 'replace' })}>
                  {t('pf.webrtcReplace')}
                </button>
                <button className={seed?.webrtc === 'disable' ? 'active' : undefined} onClick={() => patchSeed({ webrtc: 'disable' })}>
                  Tắt
                </button>
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">Timezone</span>
              {effectiveLab ? (
                <select value={seed?.timezone ?? ''} onChange={(e) => patchSeed({ timezone: e.target.value })}>
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted">{timezoneText}</span>
              )}
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.lang')}</span>
              {effectiveLab ? (
                <select
                  value={seed?.language ?? 'en-US'}
                  onChange={(e) => patchSeed({ language: e.target.value, languages: languagesFor(e.target.value) })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted">{t('pf.byProxyCountry')}</span>
              )}
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.resolution')}</span>
              <span>
                {seed ? `${seed.screen.width} × ${seed.screen.height}` : '—'}
                {seed && seed.screen.dpr !== 1 && <span className="muted"> · tỉ lệ {seed.screen.dpr * 100}%</span>}
                <span className="muted">{t('pf.byDevice')}</span>
              </span>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.hardware')}</span>
              <span>{seed ? t('pf.hwValue', { c: seed.hardware.cores, m: seed.hardware.memoryGb }) : '—'}</span>
            </div>
            <div className="row-field">
              <span className="row-label">WebGL</span>
              <span className="small-text">{seed?.webgl.renderer ?? '—'}</span>
            </div>
            <div className="row-field">
              <span className="row-label">WebGPU</span>
              <div className="seg">
                <button className="active">{t('pf.webgpuByWebgl')}</button>
                <button onClick={() => notYet('WebGPU Real')}>{t('pf.real')}</button>
                <button onClick={() => notYet('WebGPU Disabled')}>{t('pf.off')}</button>
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.mediaDevice')}</span>
              <span>{seed ? t('pf.mediaValue', { c: seed.mediaDevices.cameras, m: seed.mediaDevices.mics }) : '—'}</span>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.font')}</span>
              <div className="seg">
                <button className="active">{t('pf.default')}</button>
                <button onClick={() => notYet(t('pf.customFontList'))}>{t('common.custom')}</button>
              </div>
            </div>
            <div className="note">{t('pf.compatNote')}</div>
          </section>

          {/* ---------- Nâng cao ---------- */}
          <section className="card" id="advanced" ref={sectionRefs.advanced}>
            <h3>
              <SlidersHorizontal size={16} /> {t('pf.secAdvanced')}
            </h3>
            <div className="row-field top">
              <span className="row-label">{t('pf.hwNoise')}</span>
              <div className="inline-fields" style={{ gap: 16 }}>
                {noiseSwitch('Canvas', true, true)}
                {noiseSwitch('AudioContext', true, true)}
                {noiseSwitch('Media device', true, true)}
                {noiseSwitch('WebGL Image', false, false)}
                {noiseSwitch('ClientRects', false, false)}
                {noiseSwitch('SpeechVoices', false, false)}
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">Extension</span>
              <span className="muted">{t('pf.extNote')}</span>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.dataSync')}</span>
              <button onClick={() => notYet(t('pf.dataSync'))}>{t('pf.setup')}</button>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.browserSettings')}</span>
              <button onClick={() => notYet(t('pf.browserSettings'))}>{t('pf.setup')}</button>
            </div>
            <div className="row-field">
              <span className="row-label">{t('pf.randomFp')}</span>
              <label className="checkbox">
                <button type="button" className="switch" onClick={() => notYet(t('pf.randomFp'))} />
                <span className="muted">{t('pf.randomFpNote')}</span>
              </label>
            </div>
          </section>
        </div>

        {/* ---------- Tổng quan ---------- */}
        <aside className="card overview">
          <div className="overview-head">
            <h3 style={{ margin: 0 }}>
              <Cpu size={16} /> {t('pf.overview')}
            </h3>
            <button className="link" disabled={fpBusy} onClick={() => newFingerprint()}>
              <Shuffle size={13} /> {t('pf.newFp')}
            </button>
          </div>
          <dl className="kv">
            <dt>{t('pf.browser')}</dt>
            <dd>{seed ? `Chrome ${seed.chromeMajor}` : '—'}</dd>
            <dt>{t('pf.os')}</dt>
            <dd>{seed ? (seed.os === 'windows' ? 'Windows' : 'macOS') : '—'}</dd>
            <dt>{t('pf.device')}</dt>
            <dd>{device?.label ?? fp?.catalogId ?? '—'}</dd>
            <dt>User-Agent</dt>
            <dd className="mono small-text">{seed?.userAgent ?? '—'}</dd>
            <dt>Proxy</dt>
            <dd>{proxyText}</dd>
            <dt>Timezone</dt>
            <dd>{timezoneText ?? '—'}</dd>
            <dt>{t('pf.lang')}</dt>
            <dd>{effectiveLab ? seed?.language : t('pf.tzByProxy')}</dd>
            <dt>WebRTC</dt>
            <dd>{seed?.webrtc === 'disable' ? t('pf.off') : t('pf.webrtcReplace')}</dd>
            <dt>{t('pf.ovScreen')}</dt>
            <dd>{seed ? `${seed.screen.width}×${seed.screen.height}` : '—'}</dd>
            <dt>WebGL</dt>
            <dd className="small-text">{seed?.webgl.vendor ?? '—'}</dd>
            <dt>CPU / RAM</dt>
            <dd>{seed ? t('pf.cpuRamValue', { c: seed.hardware.cores, m: seed.hardware.memoryGb }) : '—'}</dd>
            <dt>Canvas</dt>
            <dd>{seed ? t('pf.noiseN', { n: seed.canvasNoise }) : '—'}</dd>
            <dt>Audio</dt>
            <dd>{seed ? t('pf.noiseN', { n: seed.audioNoise }) : '—'}</dd>
            <dt>Media</dt>
            <dd>{seed ? t('pf.mediaValue', { c: seed.mediaDevices.cameras, m: seed.mediaDevices.mics }) : '—'}</dd>
          </dl>
          {editing && fpDirty && (
            <p className="hint" style={{ marginBottom: 0 }}>
              {t('pf.fpWillChange')}
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
