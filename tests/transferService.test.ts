import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import type { CookieParam } from '../src/main/engine/cookies'
import { CookieService } from '../src/main/services/cookieService'
import type { LaunchService } from '../src/main/services/launchService'
import { ProfileService } from '../src/main/services/profileService'
import { ProxyService } from '../src/main/services/proxyService'
import { TransferService } from '../src/main/services/transferService'
import { fakeGeo, testSecretBox } from './helpers/fakeNet'

interface Ctx {
  root: string
  db: Db
  profiles: ProfileService
  proxies: ProxyService
  cookies: CookieService
  transfer: TransferService
}

// LaunchService giả: TransferService chỉ gọi isRunning + exportCookies.
const fakeLauncher = { isRunning: () => false, exportCookies: async () => [] } as unknown as LaunchService

function makeCtx(): Ctx {
  const root = mkdtempSync(join(tmpdir(), 'isola-tr-'))
  const db = openDatabase(join(root, 'isola.db'))
  const secrets = testSecretBox()
  const profiles = new ProfileService(db, root)
  const proxies = new ProxyService(db, secrets, fakeGeo)
  const cookies = new CookieService(db, secrets)
  const transfer = new TransferService(db, profiles, proxies, cookies, fakeLauncher)
  return { root, db, profiles, proxies, cookies, transfer }
}

const COOKIES: CookieParam[] = [
  { name: 'sid', value: 'abc123', domain: '.example.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }
]

let a: Ctx
let b: Ctx

beforeEach(() => {
  a = makeCtx()
  b = makeCtx()
})

afterEach(() => {
  a.db.close()
  b.db.close()
  rmSync(a.root, { recursive: true, force: true })
  rmSync(b.root, { recursive: true, force: true })
})

describe('TransferService', () => {
  it('xuất rồi nhập ở máy khác: dựng lại nhóm, proxy (password), tag, cookie', async () => {
    const g = a.profiles.createGroup('Shop A')
    const px = a.proxies.create({ label: 'px1', type: 'socks5', host: '1.2.3.4', port: 1080, username: 'u', password: 'p@ss' })
    const p = a.profiles.create({ name: 'Acc 1', groupId: g.id, proxyId: px.id, tags: ['fb', 'vip'], platform: 'facebook' })
    a.cookies.stage(p.id, COOKIES)

    const bundle = await a.transfer.export([p.id])
    expect(bundle.profiles).toHaveLength(1)
    expect(bundle.profiles[0].proxy).toMatchObject({ host: '1.2.3.4', port: 1080, password: 'p@ss' })
    expect(bundle.profiles[0].cookies).toHaveLength(1)
    expect(bundle.profiles[0].groupName).toBe('Shop A')

    const res = b.transfer.import(bundle)
    expect(res).toEqual({ imported: 1, warnings: [] })

    const [imp] = b.profiles.list()
    expect(imp.name).toBe('Acc 1')
    expect(imp.groupName).toBe('Shop A')
    expect(imp.tags.map((t) => t.name).sort()).toEqual(['fb', 'vip'])
    expect(imp.platform).toBe('facebook')
    // proxy dựng lại và password giải mã đúng
    const upx = b.proxies.list()[0]
    expect(b.proxies.exportConfig(upx.id)).toMatchObject({ host: '1.2.3.4', password: 'p@ss' })
    // cookie được xếp chờ nạp
    expect(b.cookies.pending(imp.id)).toHaveLength(1)
  })

  it('nhập hai lần: tên trùng thêm hậu tố, proxy trùng điểm đến không tạo lại', async () => {
    const px = a.proxies.create({ type: 'http', host: '9.9.9.9', port: 8080 })
    const p = a.profiles.create({ name: 'Dup', proxyId: px.id })
    const bundle = await a.transfer.export([p.id])

    b.transfer.import(bundle)
    b.transfer.import(bundle)

    const names = b.profiles.list().map((x) => x.name).sort()
    expect(names).toEqual(['Dup', 'Dup 2'])
    // chỉ một proxy dù nhập hai lần
    expect(b.proxies.list()).toHaveLength(1)
  })

  it('cookie từ profile đang chạy (CDP) được chuẩn hóa, bỏ trường thừa', async () => {
    const p = a.profiles.create({ name: 'Live' })
    // launcher giả: đang chạy, trả cookie kiểu CDP có trường thừa
    const liveLauncher = {
      isRunning: () => true,
      exportCookies: async () => [
        { name: 'sid', value: 'x', domain: '.a.com', path: '/', secure: true, httpOnly: false, sameSite: 'Lax', expires: 123, size: 9, priority: 'Medium', sourceScheme: 'Secure' }
      ]
    } as unknown as LaunchService
    const transfer = new TransferService(a.db, a.profiles, a.proxies, a.cookies, liveLauncher)
    const bundle = await transfer.export([p.id])
    expect(bundle.profiles[0].cookies).toEqual([
      { name: 'sid', value: 'x', path: '/', secure: true, httpOnly: false, domain: '.a.com', sameSite: 'Lax', expires: 123 }
    ])
    // và nhập lại được (qua đúng hình dạng CookieParam)
    expect(b.transfer.import(bundle).imported).toBe(1)
  })

  it('seed lệch máy: sinh fingerprint mới và báo cảnh báo, không chặn', async () => {
    const p = a.profiles.create({ name: 'Seed' })
    const bundle = await a.transfer.export([p.id])
    // làm seed không hợp lệ (catalog không tồn tại) để ép nhánh dự phòng
    bundle.profiles[0].fingerprint = { catalogId: 'không-tồn-tại', seed: { version: 1, bogus: true } }

    const res = b.transfer.import(bundle)
    expect(res.imported).toBe(1)
    expect(res.warnings).toEqual([{ name: 'Seed', reason: 'FINGERPRINT_REGENERATED' }])
    expect(b.profiles.list()[0].fingerprint).not.toBeNull()
  })
})
