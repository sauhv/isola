'use client'

import { ArrowLeft, Cpu, Fingerprint, Globe, Loader2, RefreshCw, Shuffle, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { call, isola } from '../../lib/isola'

interface Props {
  /** null = tạo mới. */
  profile: Profile | null
  onClose: () => void
  onSaved: () => void
}

type ProxyMode = 'saved' | 'new' | 'none'

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
  if (!c) return 'Chưa kiểm tra'
  if (c.error) return `Lỗi: ${c.error}`
  return [c.ip, c.country && `${c.country} - ${countryName(c.country)}`, c.city, c.timezone, c.latencyMs != null && `${c.latencyMs} ms`]
    .filter(Boolean)
    .join(' · ')
}

export default function ProfileFormPage({ profile, onClose, onSaved }: Props) {
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
    // Tạo mới (hoặc profile cũ chưa có seed): xin một fingerprint xem trước.
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
        isola().fingerprints.preview({
          catalogId,
          webrtc: seed?.webrtc,
          timezone: seed?.timezone,
          language: seed?.language
        })
      )
      setFp(next)
      if (markDirty) setFpDirty(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFpBusy(false)
    }
  }

  /** Chỉ đổi các trường seed được phép chỉnh tay (WebRTC, timezone/ngôn ngữ của lab). */
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
    if (!name.trim()) return setError('Nhập tên profile.')
    if (!fp) return setError('Chưa có fingerprint.')
    if (proxyMode === 'saved' && !proxyId) return setError('Chọn một proxy đã lưu, hoặc chuyển sang "Proxy mới" / "Không proxy".')
    if (proxyMode === 'new' && (!draft.host.trim() || !draft.port)) return setError('Nhập host và port của proxy mới.')
    if (editing && fpDirty && !confirm('Đổi fingerprint: các trang web sẽ thấy profile này như một thiết bị khác. Tiếp tục?')) return

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
        ? `Theo IP proxy: ${savedProxy.lastCheck.timezone}`
        : 'Theo IP proxy (kiểm tra proxy để biết)'
      : draftCheck?.timezone
        ? `Theo IP proxy: ${draftCheck.timezone}`
        : 'Theo IP proxy'
  const proxyText =
    proxyMode === 'none'
      ? 'Không proxy (lab)'
      : proxyMode === 'saved'
        ? savedProxy
          ? `${savedProxy.label} · ${checkText(savedProxy.lastCheck)}`
          : 'Chưa chọn'
        : draft.host
          ? `${draft.type}://${draft.host}:${draft.port} (mới)`
          : 'Proxy mới'

  return (
    <div className="form-page">
      <div className="form-page-head">
        <button className="icon ghost" onClick={onClose} title="Quay lại">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title">{editing ? `Sửa profile #${profile!.serial}` : 'Tạo profile'}</h1>
      </div>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button className="small ghost" onClick={() => setError(null)}>
            Đóng
          </button>
        </div>
      )}

      <div className="form-page-body">
        <div>
          {/* ---------- Thông tin chung ---------- */}
          <section className="card">
            <h3>
              <User size={16} /> Thông tin chung
            </h3>
            <div className="row-field">
              <span className="row-label">Tên</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Tên profile" autoFocus />
            </div>
            <div className="row-field">
              <span className="row-label">Trình duyệt</span>
              <div className="inline-fields">
                <select disabled style={{ width: 260 }}>
                  {kernels.map((k) => (
                    <option key={k.id}>
                      Chrome {k.major} ({k.id}){k.installed ? '' : ' · chưa tải'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">Hệ điều hành</span>
              <div className="seg">
                {(['windows', 'macos'] as const).map((os) => (
                  <button
                    key={os}
                    className={seed?.os === os ? 'active' : undefined}
                    disabled={hostOs !== os}
                    title={hostOs !== os ? 'Chỉ giả cùng hệ điều hành với máy đang chạy Isola' : undefined}
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
                <button
                  className="icon"
                  title="Tạo fingerprint mới (UA đi cùng thiết bị và phiên bản Chrome)"
                  disabled={fpBusy}
                  onClick={() => newFingerprint()}
                >
                  <RefreshCw size={15} className={fpBusy ? 'spin' : undefined} />
                </button>
              </div>
            </div>
            <div className="row-field">
              <span className="row-label">Nhóm</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Không nhóm</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row-field">
              <span className="row-label">Tag</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Cách nhau bằng dấu phẩy" />
            </div>
            <div className="row-field">
              <span className="row-label">Nền tảng</span>
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
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Tài khoản (username)" style={{ flex: 1 }} />
              </div>
            </div>
            <div className="row-field top">
              <span className="row-label">URL khởi động</span>
              <textarea rows={2} value={startUrls} onChange={(e) => setStartUrls(e.target.value)} placeholder="Mỗi dòng một URL http/https" />
            </div>
            <div className="row-field top">
              <span className="row-label">Ghi chú</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="row-field top">
              <span className="row-label">
                Cookie
                <span className="hint">JSON hoặc cookies.txt</span>
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
                  Cookie được mã hóa khi lưu và nạp vào trình duyệt ở lần mở kế tiếp.
                  {editing ? ' Để trống nếu không muốn nhập thêm.' : ''}
                </span>
              </div>
            </div>
          </section>

          {/* ---------- Proxy ---------- */}
          <section className="card">
            <h3>
              <Globe size={16} /> Proxy
            </h3>
            <div className="row-field">
              <span className="row-label">Kiểu kết nối</span>
              <div className="seg">
                <button className={proxyMode === 'saved' ? 'active' : undefined} onClick={() => setProxyMode('saved')}>
                  Proxy đã lưu
                </button>
                <button className={proxyMode === 'new' ? 'active' : undefined} onClick={() => setProxyMode('new')}>
                  Proxy mới
                </button>
                <button className={proxyMode === 'none' ? 'active' : undefined} onClick={() => setProxyMode('none')}>
                  Không proxy
                </button>
              </div>
            </div>

            {proxyMode === 'saved' && (
              <div className="row-field top">
                <span className="row-label">Chọn proxy</span>
                <div>
                  <div className="inline-fields" style={{ flexWrap: 'nowrap' }}>
                    <select value={proxyId} onChange={(e) => setProxyId(e.target.value)} style={{ flex: 1 }}>
                      <option value="">— Chọn —</option>
                      {proxies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} · {p.type}
                          {p.lastCheck && !p.lastCheck.error ? ` · ${p.lastCheck.ip} ${p.lastCheck.country ?? ''}` : ''}
                          {p.lastCheck?.error ? ' · lỗi' : ''}
                          {p.profileCount > 0 && p.id !== profile?.proxyId ? ` · đang dùng bởi ${p.profileCount} profile` : ''}
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
                  <span className="row-label">Loại / Host / Port</span>
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
                  <span className="row-label">Tài khoản proxy</span>
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
                  <span className="hint">Proxy mới được lưu vào danh sách Proxy khi tạo profile. Password được mã hóa.</span>
                </div>
              </>
            )}

            {proxyMode === 'none' ? (
              <div className="note">Không proxy: profile mở bằng IP thật của máy và được đánh dấu là profile lab.</div>
            ) : (
              <div className="row-field">
                <span />
                <label className="checkbox">
                  <input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
                  Profile lab: không ép timezone/ngôn ngữ theo IP proxy
                </label>
              </div>
            )}
          </section>

          {/* ---------- Fingerprint ---------- */}
          <section className="card">
            <h3>
              <Fingerprint size={16} /> Fingerprint <span className="tag" style={{ marginLeft: 4 }}>compat</span>
            </h3>
            <div className="row-field">
              <span className="row-label">Thiết bị</span>
              <select
                value={fp?.catalogId ?? ''}
                disabled={fpBusy}
                onChange={(e) => newFingerprint(e.target.value)}
              >
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
                  Thay bằng IP proxy
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
              <span className="row-label">Ngôn ngữ</span>
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
                <span className="muted">Theo quốc gia của IP proxy</span>
              )}
            </div>
            <div className="row-field">
              <span className="row-label">Màn hình</span>
              <span>
                {seed ? `${seed.screen.width} × ${seed.screen.height}` : '—'}
                {seed && seed.screen.dpr !== 1 && <span className="muted"> · tỉ lệ {seed.screen.dpr * 100}%</span>}
              </span>
            </div>
            <div className="row-field">
              <span className="row-label">Phần cứng</span>
              <span>{seed ? `${seed.hardware.cores} nhân CPU · ${seed.hardware.memoryGb} GB RAM` : '—'}</span>
            </div>
            <div className="row-field">
              <span className="row-label">WebGL</span>
              <span className="small-text">{seed?.webgl.renderer ?? '—'}</span>
            </div>
            <div className="row-field">
              <span className="row-label">Canvas / Audio</span>
              <span>Nhiễu ổn định theo seed (không đổi giữa các lần mở)</span>
            </div>
            <div className="row-field">
              <span className="row-label">Font</span>
              <span className="muted">Font thật của máy (chế độ compat chưa giả font)</span>
            </div>
            <div className="note">Chế độ compat. Fingerprint áp qua CDP trên Chrome for Testing, chưa phải kernel vá.</div>
          </section>
        </div>

        {/* ---------- Tổng quan ---------- */}
        <aside className="card overview">
          <h3>
            <Cpu size={16} /> Tổng quan
          </h3>
          <dl className="kv">
            <dt>Trình duyệt</dt>
            <dd>{seed ? `Chrome ${seed.chromeMajor}` : '—'}</dd>
            <dt>Hệ điều hành</dt>
            <dd>{seed ? (seed.os === 'windows' ? 'Windows' : 'macOS') : '—'}</dd>
            <dt>Thiết bị</dt>
            <dd>{device?.label ?? fp?.catalogId ?? '—'}</dd>
            <dt>User-Agent</dt>
            <dd className="mono small-text">{seed?.userAgent ?? '—'}</dd>
            <dt>Proxy</dt>
            <dd>{proxyText}</dd>
            <dt>Timezone</dt>
            <dd>{timezoneText ?? '—'}</dd>
            <dt>Ngôn ngữ</dt>
            <dd>{effectiveLab ? seed?.language : 'Theo IP proxy'}</dd>
            <dt>WebRTC</dt>
            <dd>{seed?.webrtc === 'disable' ? 'Tắt' : 'Thay bằng IP proxy'}</dd>
            <dt>Màn hình</dt>
            <dd>{seed ? `${seed.screen.width}×${seed.screen.height}` : '—'}</dd>
            <dt>WebGL</dt>
            <dd className="small-text">{seed?.webgl.vendor ?? '—'}</dd>
            <dt>CPU / RAM</dt>
            <dd>{seed ? `${seed.hardware.cores} nhân · ${seed.hardware.memoryGb} GB` : '—'}</dd>
            <dt>Canvas</dt>
            <dd>{seed ? `Nhiễu #${seed.canvasNoise}` : '—'}</dd>
            <dt>Audio</dt>
            <dd>{seed ? `Nhiễu #${seed.audioNoise}` : '—'}</dd>
            <dt>Media</dt>
            <dd>{seed ? `${seed.mediaDevices.cameras} camera · ${seed.mediaDevices.mics} micro` : '—'}</dd>
          </dl>
          <button className="soft" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} disabled={fpBusy} onClick={() => newFingerprint()}>
            <Shuffle size={15} /> Tạo fingerprint mới
          </button>
          {editing && fpDirty && <p className="hint" style={{ marginBottom: 0 }}>Fingerprint sẽ được đổi khi bấm Lưu.</p>}
        </aside>
      </div>

      <div className="form-foot">
        <button onClick={onClose}>Hủy</button>
        <button className="primary" disabled={saving || !fp} onClick={save}>
          {saving && <Loader2 size={14} className="spin" />}
          {editing ? 'Lưu' : 'Tạo profile'}
        </button>
      </div>
    </div>
  )
}
