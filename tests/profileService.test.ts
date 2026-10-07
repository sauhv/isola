import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { paths } from '../src/main/paths'
import { ProfileService } from '../src/main/services/profileService'

let dataRoot: string
let db: Db
let svc: ProfileService

beforeEach(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-ps-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  svc = new ProfileService(db, dataRoot)
})

afterEach(() => {
  db.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

const actions = (id: string) =>
  db
    .prepare('SELECT action FROM audit_log WHERE profile_id = ? ORDER BY at, rowid')
    .all(id)
    .map((r: any) => r.action)

describe('profileService', () => {
  it('serial tăng dần, tên trùng bị từ chối', () => {
    const a = svc.create({ name: 'A' })
    const b = svc.create({ name: 'B' })
    expect([a.serial, b.serial]).toEqual([1, 2])
    expect(() => svc.create({ name: 'A' })).toThrow(expect.objectContaining({ code: 'NAME_TAKEN' }))
    expect(actions(a.id)).toEqual(['create'])
  })

  it('tag: tạo theo tên, lọc theo tag, tag mồ côi bị dọn', () => {
    const a = svc.create({ name: 'A', tags: ['fb', 'khách 1', 'fb'] })
    svc.create({ name: 'B', tags: ['tiktok'] })
    expect(a.tags.map((t) => t.name)).toEqual(['fb', 'khách 1'])

    const fb = svc.listTags().find((t) => t.name === 'fb')!
    expect(svc.list({ tagId: fb.id }).map((p) => p.name)).toEqual(['A'])

    svc.update(a.id, { tags: ['fb'] })
    expect(svc.listTags().map((t) => t.name)).toEqual(['fb', 'tiktok'])
  })

  it('nhóm: lọc, đếm, xóa nhóm thì profile về không nhóm', () => {
    const g = svc.createGroup('Shop')
    const a = svc.create({ name: 'A', groupId: g.id })
    svc.create({ name: 'B' })
    expect(svc.list({ groupId: g.id }).map((p) => p.name)).toEqual(['A'])
    expect(svc.listGroups()[0].profileCount).toBe(1)
    expect(() => svc.createGroup('Shop')).toThrow(expect.objectContaining({ code: 'NAME_TAKEN' }))

    svc.removeGroup(g.id)
    expect(svc.get(a.id).groupId).toBeNull()
  })

  it('archive ẩn khỏi danh sách, purge cần xác nhận hoặc đủ 7 ngày, xóa user-data', () => {
    const a = svc.create({ name: 'A' })
    const dir = paths.userData(dataRoot, a.id)
    mkdirSync(dir, { recursive: true })

    svc.archive(a.id)
    expect(svc.list().map((p) => p.id)).not.toContain(a.id)
    expect(svc.list({ archived: true }).map((p) => p.id)).toContain(a.id)
    expect(() => svc.update(a.id, { name: 'X' })).toThrow(expect.objectContaining({ code: 'ARCHIVED' }))
    expect(() => svc.purge(a.id, false)).toThrow(expect.objectContaining({ code: 'PURGE_TOO_EARLY' }))

    svc.purge(a.id, true)
    expect(existsSync(dir)).toBe(false)
    expect(() => svc.get(a.id)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
    expect(db.prepare('SELECT COUNT(*) AS n FROM fingerprints').get()).toEqual({ n: 0 })
    expect(actions(a.id)).toEqual(['create', 'archive', 'purge'])
  })

  it('purge tự được phép sau 7 ngày lưu trữ', () => {
    const a = svc.create({ name: 'A' })
    svc.archive(a.id)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
    db.prepare('UPDATE profiles SET deleted_at = ? WHERE id = ?').run(eightDaysAgo, a.id)
    svc.purge(a.id, false)
    expect(svc.list({ archived: true })).toEqual([])
  })

  it('resetStaleRunning đưa profile kẹt running về idle', () => {
    const a = svc.create({ name: 'A' })
    svc.setStatus(a.id, 'running')
    expect(svc.resetStaleRunning()).toBe(1)
    expect(svc.get(a.id).status).toBe('idle')
  })
})
