import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import type { CookieParam } from '../src/main/engine/cookies'
import { CookieService } from '../src/main/services/cookieService'
import { ProfileService } from '../src/main/services/profileService'
import { testSecretBox } from './helpers/fakeNet'

let dir: string
let db: Db
let cookies: CookieService
let profiles: ProfileService
let pid: string

const sample: CookieParam[] = [
  { name: 'c_user', value: '100000', domain: '.facebook.com', path: '/', secure: true, httpOnly: false },
  { name: 'xs', value: 'secret-xyz', domain: '.facebook.com', path: '/', secure: true, httpOnly: true }
]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'isola-ck-'))
  db = openDatabase(join(dir, 'isola.db'))
  cookies = new CookieService(db, testSecretBox())
  profiles = new ProfileService(db, dir)
  pid = profiles.create({ name: 'FB acc', lab: true }).id
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('CookieService backup (giống AdsPower: cookie tự lưu sau khi dùng)', () => {
  it('lưu rồi đọc lại đúng cookie, mã hóa payload', () => {
    cookies.saveBackup(pid, sample)
    const b = cookies.backup(pid)
    expect(b?.count).toBe(2)
    expect(b?.cookies).toEqual(sample)
    expect(b?.updatedAt).toBeTruthy()
    // payload lưu dạng mã hóa, không để cookie thô trong DB
    const raw = db.prepare('SELECT payload_enc FROM cookies_backup WHERE profile_id = ?').get(pid) as { payload_enc: string }
    expect(raw.payload_enc).not.toContain('secret-xyz')
  })

  it('backupInfo trả số lượng mà không cần giải mã', () => {
    cookies.saveBackup(pid, sample)
    expect(cookies.backupInfo(pid)).toMatchObject({ count: 2 })
  })

  it('ghi đè bản lưu khi chụp lại', () => {
    cookies.saveBackup(pid, sample)
    cookies.saveBackup(pid, [sample[0]])
    expect(cookies.backup(pid)?.count).toBe(1)
  })

  it('lưu danh sách rỗng thì xóa bản lưu', () => {
    cookies.saveBackup(pid, sample)
    cookies.saveBackup(pid, [])
    expect(cookies.backup(pid)).toBeNull()
  })

  it('purge profile xóa luôn cookie đã lưu', () => {
    cookies.saveBackup(pid, sample)
    profiles.archive(pid)
    profiles.purge(pid, true)
    expect(cookies.backup(pid)).toBeNull()
    expect(db.prepare('SELECT COUNT(*) n FROM cookies_backup').get()).toMatchObject({ n: 0 })
  })
})
