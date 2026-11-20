import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { ExtensionService } from '../src/main/services/extensionService'
import { ProfileService } from '../src/main/services/profileService'

let dir: string
let db: Db
let ext: ExtensionService
let profiles: ProfileService
let aId: string
let bId: string
let extId: string

function makeExtension(root: string, version = '1.0'): string {
  const src = join(root, 'src-ext')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(src, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Demo', version }))
  writeFileSync(join(src, 'bg.js'), '// noop')
  return src
}

const manifestKey = (d: string) => (JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8')) as { key?: string }).key

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'isola-xi-'))
  db = openDatabase(join(dir, 'isola.db'))
  ext = new ExtensionService(db, join(dir, 'extensions'), { prodVersion: '155.0.8059.39' })
  profiles = new ProfileService(db, dir)
  aId = profiles.create({ name: 'A', lab: true }).id
  bId = profiles.create({ name: 'B', lab: true }).id
  const e = ext.addFromPath(makeExtension(dir))
  extId = e.id
  ext.update(extId, { scope: 'all' })
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('ID extension riêng mỗi profile', () => {
  it('mỗi profile một bản sao với key khác nhau', () => {
    const [da] = ext.isolatedDirsForProfile(aId)
    const [dbb] = ext.isolatedDirsForProfile(bId)
    expect(da).toBeTruthy()
    expect(dbb).toBeTruthy()
    expect(da).not.toBe(dbb)
    const ka = manifestKey(da)
    const kb = manifestKey(dbb)
    expect(ka).toBeTruthy()
    expect(kb).toBeTruthy()
    expect(ka).not.toBe(kb) // ID khác nhau giữa profile
  })

  it('cùng profile → key ổn định giữa các lần (dữ liệu extension không mất)', () => {
    const k1 = manifestKey(ext.isolatedDirsForProfile(aId)[0])
    const k2 = manifestKey(ext.isolatedDirsForProfile(aId)[0])
    expect(k1).toBe(k2)
  })

  it('dựng lại khi extension đổi phiên bản nhưng giữ nguyên key của profile', () => {
    const before = ext.isolatedDirsForProfile(aId)[0]
    const keyBefore = manifestKey(before)
    ext.updateFromPath(extId, makeExtension(dir, '2.0'))
    const after = ext.isolatedDirsForProfile(aId)[0]
    const m = JSON.parse(readFileSync(join(after, 'manifest.json'), 'utf8')) as { version: string; key?: string }
    expect(m.version).toBe('2.0') // bản sao cập nhật theo phiên bản mới
    expect(m.key).toBe(keyBefore) // key (ID) của profile giữ nguyên
  })
})
