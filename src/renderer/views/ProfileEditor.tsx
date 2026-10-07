'use client'

import { useState, type FormEvent } from 'react'
import type { Group, Profile, Proxy } from '../../shared/types'
import { countryName } from '../lib/format'
import { call, isola } from '../lib/isola'

interface Props {
  profile: Profile | null
  groups: Group[]
  proxies: Proxy[]
  onClose: () => void
  onSaved: () => void
}

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

const PLATFORMS = ['facebook', 'tiktok', 'google', 'amazon', 'shopee', 'instagram', 'twitter', 'telegram', 'discord']

export default function ProfileEditor({ profile, groups, proxies, onClose, onSaved }: Props) {
  const [name, setName] = useState(profile?.name ?? '')
  const [groupId, setGroupId] = useState(profile?.groupId ?? '')
  const [platform, setPlatform] = useState(profile?.platform ?? '')
  const [proxyId, setProxyId] = useState(profile?.proxyId ?? '')
  const [tags, setTags] = useState(profile?.tags.map((t) => t.name).join(', ') ?? '')
  const [startUrls, setStartUrls] = useState(profile?.startUrls.join('\n') ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [notes, setNotes] = useState(profile?.notes ?? '')
  const [lab, setLab] = useState(profile?.lab ?? false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const fields = {
      name,
      groupId: groupId || null,
      proxyId: proxyId || null,
      platform: platform.trim() || null,
      tags: splitTags(tags),
      startUrls: splitLines(startUrls),
      username: username.trim() || null,
      notes: notes.trim() || null,
      lab
    }
    try {
      if (profile) await call(isola().profiles.update(profile.id, fields))
      else await call(isola().profiles.create(fields))
      onSaved()
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" style={{ width: 'min(720px, calc(100vw - 32px))' }} onSubmit={submit} autoComplete="off">
        <h2>{profile ? `Sửa profile #${profile.serial}` : 'Tạo profile'}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <div className="section-title">Cơ bản</div>
          <div className="form-row">
            <label className="field" style={{ flex: 2 }}>
              <span>Tên</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Nhóm</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Không nhóm</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Nền tảng</span>
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                list="isola-platforms"
                placeholder="facebook, tiktok…"
                maxLength={50}
              />
              <datalist id="isola-platforms">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="field" style={{ flex: 2 }}>
              <span>Tag</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="khách A, ads" />
              <span className="hint">Cách nhau bằng dấu phẩy.</span>
            </label>
          </div>

          <div className="section-title">Kết nối</div>
          <label className="field">
            <span>Proxy</span>
            <select value={proxyId} onChange={(e) => setProxyId(e.target.value)}>
              <option value="">Không proxy (chỉ profile lab mới mở được)</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.type}
                  {p.lastCheck && !p.lastCheck.error
                    ? ` · ${p.lastCheck.ip} ${p.lastCheck.country ? countryName(p.lastCheck.country) : ''}`
                    : ''}
                  {p.lastCheck?.error ? ' · lỗi' : ''}
                  {p.profileCount > 0 && p.id !== profile?.proxyId ? ` · đang dùng bởi ${p.profileCount} profile` : ''}
                </option>
              ))}
            </select>
            {profile?.status === 'running' && <span className="hint">Đóng profile trước khi đổi proxy.</span>}
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
            Profile lab: cho phép mở không cần proxy, không ép timezone theo proxy
          </label>

          <div className="section-title">Khởi động và tài khoản</div>
          <label className="field">
            <span>URL mở khi khởi động</span>
            <textarea rows={2} value={startUrls} onChange={(e) => setStartUrls(e.target.value)} placeholder="https://example.com" />
            <span className="hint">Mỗi dòng một URL http/https.</span>
          </label>
          <div className="form-row">
            <label className="field" style={{ flex: 1 }}>
              <span>Tài khoản (username)</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
              <span className="hint">Chưa hỗ trợ lưu mật khẩu tài khoản.</span>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Ghi chú</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          <div className="section-title">Fingerprint</div>
          <div className="note">
            <span className="tag" style={{ marginRight: 8 }}>
              compat
            </span>
            Chế độ compat. Fingerprint áp qua CDP trên Chrome for Testing, chưa phải kernel vá.
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="primary" disabled={saving || !name.trim()}>
            {profile ? 'Lưu' : 'Tạo profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
