import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import type { Group, Profile, ProfileFilter, ProfileInput, ProfilePatch, Tag } from '../../shared/types'
import type { Db } from '../db'
import { DEFAULT_KERNEL_ID, findSupportedKernel } from '../engine/kernels'
import { IsolaError } from '../errors'
import { paths } from '../paths'
import { audit } from './audit'

const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

type ProfileRow = {
  id: string
  serial: number
  name: string
  group_id: string | null
  group_name: string | null
  start_urls: string
  username: string | null
  status: Profile['status']
  kernel: string
  proxy_host: string | null
  lab: number
  notes: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

const SELECT_PROFILE = `
  SELECT p.id, p.serial, p.name, p.group_id, g.name AS group_name, p.start_urls, p.username,
         p.status, p.kernel, x.host AS proxy_host, p.lab, p.notes, p.deleted_at, p.created_at, p.updated_at
  FROM profiles p
  LEFT JOIN groups g ON g.id = p.group_id
  LEFT JOIN proxies x ON x.id = p.proxy_id`

function now(): string {
  return new Date().toISOString()
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

export class ProfileService {
  constructor(
    private readonly db: Db,
    private readonly dataRoot: string
  ) {}

  // ---------- profiles ----------

  list(filter: ProfileFilter = {}): Profile[] {
    const where: string[] = [filter.archived ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL']
    const args: unknown[] = []
    if (filter.groupId) {
      where.push('p.group_id = ?')
      args.push(filter.groupId)
    }
    if (filter.tagId) {
      where.push('EXISTS (SELECT 1 FROM profile_tags pt WHERE pt.profile_id = p.id AND pt.tag_id = ?)')
      args.push(filter.tagId)
    }
    if (filter.search?.trim()) {
      where.push('p.name LIKE ?')
      args.push(`%${filter.search.trim()}%`)
    }
    const rows = this.db
      .prepare(`${SELECT_PROFILE} WHERE ${where.join(' AND ')} ORDER BY p.serial DESC`)
      .all(...args) as ProfileRow[]
    return this.withTags(rows)
  }

  get(id: string): Profile {
    const row = this.db.prepare(`${SELECT_PROFILE} WHERE p.id = ?`).get(id) as ProfileRow | undefined
    if (!row) throw new IsolaError('NOT_FOUND', `Không có profile ${id}`)
    return this.withTags([row])[0]
  }

  create(input: ProfileInput): Profile {
    const kernel = input.kernel ?? DEFAULT_KERNEL_ID
    if (!findSupportedKernel(kernel)) throw new IsolaError('KERNEL_UNKNOWN')
    if (input.groupId) this.requireGroup(input.groupId)

    const id = randomUUID()
    const ts = now()
    try {
      this.db.transaction(() => {
        const { next } = this.db.prepare('SELECT COALESCE(MAX(serial), 0) + 1 AS next FROM profiles').get() as {
          next: number
        }
        // Phase 1: seed giữ chỗ. Phase 3 sinh seed thật từ catalog.
        const fingerprintId = randomUUID()
        this.db
          .prepare('INSERT INTO fingerprints (id, seed_json, catalog_id, created_at) VALUES (?, ?, ?, ?)')
          .run(fingerprintId, JSON.stringify({ version: 0 }), 'pending', ts)
        this.db
          .prepare(
            `INSERT INTO profiles (id, serial, name, group_id, start_urls, username, kernel, fingerprint_id, lab, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            next,
            input.name.trim(),
            input.groupId ?? null,
            JSON.stringify(input.startUrls ?? []),
            input.username ?? null,
            kernel,
            fingerprintId,
            input.lab ? 1 : 0,
            input.notes ?? null,
            ts,
            ts
          )
        this.setTags(id, input.tags ?? [])
        audit(this.db, 'create', id, { serial: next, kernel })
      })()
    } catch (err) {
      if (isUniqueViolation(err)) throw new IsolaError('NAME_TAKEN', `Tên "${input.name}" đã có`)
      throw err
    }
    return this.get(id)
  }

  update(id: string, patch: ProfilePatch): Profile {
    const current = this.get(id)
    if (current.deletedAt) throw new IsolaError('ARCHIVED')
    if (patch.groupId) this.requireGroup(patch.groupId)

    const sets: string[] = []
    const args: unknown[] = []
    const set = (col: string, value: unknown) => {
      sets.push(`${col} = ?`)
      args.push(value)
    }
    if (patch.name !== undefined) set('name', patch.name.trim())
    if (patch.groupId !== undefined) set('group_id', patch.groupId)
    if (patch.startUrls !== undefined) set('start_urls', JSON.stringify(patch.startUrls))
    if (patch.username !== undefined) set('username', patch.username)
    if (patch.notes !== undefined) set('notes', patch.notes)
    if (patch.lab !== undefined) set('lab', patch.lab ? 1 : 0)
    set('updated_at', now())

    try {
      this.db.transaction(() => {
        this.db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
        if (patch.tags !== undefined) this.setTags(id, patch.tags)
      })()
    } catch (err) {
      if (isUniqueViolation(err)) throw new IsolaError('NAME_TAKEN', `Tên "${patch.name}" đã có`)
      throw err
    }
    return this.get(id)
  }

  archive(id: string): void {
    const p = this.get(id)
    if (p.deletedAt) return
    if (p.status === 'running') throw new IsolaError('PROFILE_RUNNING')
    const ts = now()
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE profiles SET deleted_at = ?, status = 'archived', updated_at = ? WHERE id = ?")
        .run(ts, ts, id)
      audit(this.db, 'archive', id)
    })()
  }

  restore(id: string): void {
    const p = this.get(id)
    if (!p.deletedAt) throw new IsolaError('NOT_ARCHIVED')
    this.db
      .prepare("UPDATE profiles SET deleted_at = NULL, status = 'idle', updated_at = ? WHERE id = ?")
      .run(now(), id)
  }

  /** Xóa hẳn profile và thư mục user-data. Chỉ khi đã lưu trữ quá 7 ngày hoặc người dùng xác nhận. */
  purge(id: string, confirmed: boolean): void {
    const p = this.get(id)
    if (!p.deletedAt) throw new IsolaError('NOT_ARCHIVED')
    if (!confirmed && Date.now() - Date.parse(p.deletedAt) < PURGE_AFTER_MS) throw new IsolaError('PURGE_TOO_EARLY')

    const { fingerprint_id } = this.db.prepare('SELECT fingerprint_id FROM profiles WHERE id = ?').get(id) as {
      fingerprint_id: string
    }
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM profile_tags WHERE profile_id = ?').run(id)
      this.db.prepare('DELETE FROM cookies_import WHERE profile_id = ?').run(id)
      this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
      this.db.prepare('DELETE FROM fingerprints WHERE id = ?').run(fingerprint_id)
      audit(this.db, 'purge', id, { serial: p.serial })
    })()
    rmSync(paths.profile(this.dataRoot, id), { recursive: true, force: true })
  }

  setStatus(id: string, status: 'idle' | 'running'): void {
    this.db
      .prepare('UPDATE profiles SET status = ? WHERE id = ? AND deleted_at IS NULL')
      .run(status, id)
  }

  /** Lúc app khởi động không có process nào đang chạy, mọi `running` còn sót là do crash. */
  resetStaleRunning(): number {
    return this.db.prepare("UPDATE profiles SET status = 'idle' WHERE status = 'running'").run().changes
  }

  // ---------- groups ----------

  listGroups(): Group[] {
    const rows = this.db
      .prepare(
        `SELECT g.id, g.name, g.created_at,
                (SELECT COUNT(*) FROM profiles p WHERE p.group_id = g.id AND p.deleted_at IS NULL) AS cnt
         FROM groups g ORDER BY g.name COLLATE NOCASE`
      )
      .all() as { id: string; name: string; created_at: string; cnt: number }[]
    return rows.map((r) => ({ id: r.id, name: r.name, profileCount: r.cnt, createdAt: r.created_at }))
  }

  createGroup(name: string): Group {
    const id = randomUUID()
    const ts = now()
    try {
      this.db.prepare('INSERT INTO groups (id, name, created_at) VALUES (?, ?, ?)').run(id, name.trim(), ts)
    } catch (err) {
      if (isUniqueViolation(err)) throw new IsolaError('NAME_TAKEN', `Nhóm "${name}" đã có`)
      throw err
    }
    return { id, name: name.trim(), profileCount: 0, createdAt: ts }
  }

  renameGroup(id: string, name: string): void {
    this.requireGroup(id)
    try {
      this.db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), id)
    } catch (err) {
      if (isUniqueViolation(err)) throw new IsolaError('NAME_TAKEN', `Nhóm "${name}" đã có`)
      throw err
    }
  }

  /** Xóa nhóm. Profile trong nhóm chuyển về "không nhóm", không bị xóa. */
  removeGroup(id: string): void {
    this.requireGroup(id)
    this.db.transaction(() => {
      this.db.prepare('UPDATE profiles SET group_id = NULL WHERE group_id = ?').run(id)
      this.db.prepare('DELETE FROM groups WHERE id = ?').run(id)
    })()
  }

  // ---------- tags ----------

  listTags(): Tag[] {
    return this.db.prepare('SELECT id, name FROM tags ORDER BY name COLLATE NOCASE').all() as Tag[]
  }

  // ---------- helpers ----------

  private requireGroup(id: string): void {
    if (!this.db.prepare('SELECT 1 FROM groups WHERE id = ?').get(id)) {
      throw new IsolaError('NOT_FOUND', `Không có nhóm ${id}`)
    }
  }

  private setTags(profileId: string, names: string[]): void {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    this.db.prepare('DELETE FROM profile_tags WHERE profile_id = ?').run(profileId)
    const find = this.db.prepare('SELECT id FROM tags WHERE name = ?')
    const insertTag = this.db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)')
    const link = this.db.prepare('INSERT INTO profile_tags (profile_id, tag_id) VALUES (?, ?)')
    for (const name of unique) {
      let tag = find.get(name) as { id: string } | undefined
      if (!tag) {
        tag = { id: randomUUID() }
        insertTag.run(tag.id, name)
      }
      link.run(profileId, tag.id)
    }
    // Tag không còn profile nào dùng thì xóa để danh sách lọc gọn.
    this.db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM profile_tags)').run()
  }

  private withTags(rows: ProfileRow[]): Profile[] {
    if (rows.length === 0) return []
    const tagRows = this.db
      .prepare(
        `SELECT pt.profile_id, t.id, t.name FROM profile_tags pt JOIN tags t ON t.id = pt.tag_id
         WHERE pt.profile_id IN (${rows.map(() => '?').join(',')}) ORDER BY t.name COLLATE NOCASE`
      )
      .all(...rows.map((r) => r.id)) as { profile_id: string; id: string; name: string }[]
    const tagsByProfile = new Map<string, Tag[]>()
    for (const t of tagRows) {
      const list = tagsByProfile.get(t.profile_id) ?? []
      list.push({ id: t.id, name: t.name })
      tagsByProfile.set(t.profile_id, list)
    }
    return rows.map((r) => ({
      id: r.id,
      serial: r.serial,
      name: r.name,
      groupId: r.group_id,
      groupName: r.group_name,
      tags: tagsByProfile.get(r.id) ?? [],
      startUrls: JSON.parse(r.start_urls),
      username: r.username,
      status: r.status,
      kernel: r.kernel,
      proxyHost: r.proxy_host,
      lab: r.lab === 1,
      notes: r.notes,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }))
  }
}
