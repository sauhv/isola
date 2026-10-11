import { randomUUID } from 'node:crypto'
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

describe('profileService nhân bản & tạo hàng loạt (Phase 5)', () => {
  const addProxy = (label: string) => {
    const pid = randomUUID()
    db.prepare('INSERT INTO proxies (id, label, type, host, port, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      pid,
      label,
      'http',
      'h.example',
      80,
      'now'
    )
    return pid
  }

  it('clone: chép thông tin, tên "(bản sao)" duy nhất, seed mới, không chép cookie', () => {
    const g = svc.createGroup('G')
    const src = svc.create({
      name: 'Gốc',
      groupId: g.id,
      platform: 'facebook',
      tags: ['a', 'b'],
      startUrls: ['https://x.com'],
      notes: 'ghi chú',
      lab: true
    })
    const c1 = svc.clone(src.id)
    expect(c1.name).toBe('Gốc (bản sao)')
    expect(c1.id).not.toBe(src.id)
    expect(c1.serial).toBeGreaterThan(src.serial)
    expect(c1.groupId).toBe(g.id)
    expect(c1.platform).toBe('facebook')
    expect(c1.tags.map((t) => t.name).sort()).toEqual(['a', 'b'])
    expect(c1.startUrls).toEqual(['https://x.com'])
    expect(c1.lab).toBe(true)
    expect(c1.fingerprint).not.toBeNull()

    const fpOf = (id: string) => (db.prepare('SELECT fingerprint_id FROM profiles WHERE id = ?').get(id) as any).fingerprint_id
    expect(fpOf(c1.id)).not.toBe(fpOf(src.id))
    // không chép cookie import
    expect(db.prepare('SELECT COUNT(*) AS n FROM cookies_import').get()).toEqual({ n: 0 })

    const c2 = svc.clone(src.id)
    expect(c2.name).toBe('Gốc (bản sao) 2')
  })

  it('createMany: mẫu {n}, gán proxy xoay vòng, đếm đúng', () => {
    const p1 = addProxy('p1')
    const p2 = addProxy('p2')
    const g = svc.createGroup('Shop')
    const r = svc.createMany({ count: 5, namePattern: 'Shop {n}', groupId: g.id, platform: 'tiktok', proxyIds: [p1, p2], lab: true })
    expect(r.created).toBe(5)
    expect(r.errors).toEqual([])

    const list = svc.list().filter((p) => p.name.startsWith('Shop '))
    expect(list.map((p) => p.name).sort()).toEqual(['Shop 1', 'Shop 2', 'Shop 3', 'Shop 4', 'Shop 5'])
    const byName = Object.fromEntries(list.map((p) => [p.name, p.proxyId]))
    expect(byName['Shop 1']).toBe(p1)
    expect(byName['Shop 2']).toBe(p2)
    expect(byName['Shop 3']).toBe(p1)
    expect(list.every((p) => p.lab && p.platform === 'tiktok' && p.groupId === g.id)).toBe(true)
  })

  it('createMany: không có {n} thì nối số và tránh trùng tên', () => {
    svc.create({ name: 'Acc 1' })
    const r = svc.createMany({ count: 3, namePattern: 'Acc' })
    expect(r.created).toBe(3)
    const names = svc.list().map((p) => p.name).filter((n) => n.startsWith('Acc'))
    expect(names).toContain('Acc 2')
    expect(names).toContain('Acc 3')
    expect(new Set(names).size).toBe(names.length)
  })

  it('cleanupOrphans: xóa thư mục UUID không còn trong DB, giữ profile thật và thư mục lạ', () => {
    const p = svc.create({ name: 'Giữ' })
    mkdirSync(paths.userData(dataRoot, p.id), { recursive: true }) // profile thật có user-data
    const orphan = '0899766d-cb17-4a19-8e97-2af25714b216'
    mkdirSync(join(dataRoot, 'profiles', orphan), { recursive: true }) // mồ côi (không trong DB)
    mkdirSync(join(dataRoot, 'profiles', 'khong-phai-uuid'), { recursive: true }) // tên lạ, không đụng

    expect(svc.cleanupOrphans()).toBe(1)
    expect(existsSync(join(dataRoot, 'profiles', orphan))).toBe(false)
    expect(existsSync(paths.profile(dataRoot, p.id))).toBe(true)
    expect(existsSync(join(dataRoot, 'profiles', 'khong-phai-uuid'))).toBe(true)
  })

  it('cleanupOrphans: giữ thư mục của profile đã lưu trữ', () => {
    const p = svc.create({ name: 'Lưu trữ' })
    mkdirSync(paths.profile(dataRoot, p.id), { recursive: true })
    svc.archive(p.id)
    expect(svc.cleanupOrphans()).toBe(0)
    expect(existsSync(paths.profile(dataRoot, p.id))).toBe(true)
  })
})
