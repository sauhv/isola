'use client'

import { useState, type FormEvent } from 'react'
import type { Group, Profile } from '../../shared/types'
import { call, isola } from '../lib/isola'

interface Props {
  profile: Profile | null
  groups: Group[]
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

export default function ProfileEditor({ profile, groups, onClose, onSaved }: Props) {
  const [name, setName] = useState(profile?.name ?? '')
  const [groupId, setGroupId] = useState(profile?.groupId ?? '')
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
      <form className="dialog" onSubmit={submit}>
        <h2>{profile ? `Sửa profile #${profile.serial}` : 'Tạo profile'}</h2>
        {error && <div className="error-bar">{error}</div>}
        <div className="form">
          <label className="field">
            <span>Tên</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
          </label>
          <label className="field">
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
          <label className="field">
            <span>Tag</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="facebook, khách A" />
            <span className="hint">Cách nhau bằng dấu phẩy.</span>
          </label>
          <label className="field">
            <span>URL mở khi khởi động</span>
            <textarea
              rows={3}
              value={startUrls}
              onChange={(e) => setStartUrls(e.target.value)}
              placeholder="https://example.com"
            />
            <span className="hint">Mỗi dòng một URL http/https.</span>
          </label>
          <label className="field">
            <span>Tài khoản (username)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            <span className="hint">Ô mật khẩu có ở Phase 5, khi mật khẩu được mã hóa bằng safeStorage.</span>
          </label>
          <label className="field">
            <span>Ghi chú</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={lab} onChange={(e) => setLab(e.target.checked)} />
            Profile lab (cho phép mở không cần proxy)
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="primary" disabled={saving || !name.trim()}>
            {profile ? 'Lưu' : 'Tạo'}
          </button>
        </div>
      </form>
    </div>
  )
}
