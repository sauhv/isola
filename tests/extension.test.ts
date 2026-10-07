import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { parseCrx } from '../src/main/engine/crx'
import { ExtensionService, parseStoreId } from '../src/main/services/extensionService'
import { ProfileService } from '../src/main/services/profileService'
import { buildCrx3, makeZip, newKey, sampleExtension } from './helpers/crxBuilder'

let dataRoot: string
let db: Db
let svc: ExtensionService
let profiles: ProfileService

const file = (name: string, content: Buffer) => {
  const p = join(dataRoot, name)
  writeFileSync(p, content)
  return p
}

beforeEach(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-ext-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  svc = new ExtensionService(db, join(dataRoot, 'extensions'), { prodVersion: '155.0.8059.39' })
  profiles = new ProfileService(db, dataRoot)
})

afterEach(() => {
  db.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('crx', () => {
  it('đọc CRX3, ID khớp khóa; sửa 1 byte thì chữ ký sai', () => {
    const key = newKey()
    const crx = buildCrx3(makeZip(sampleExtension('1.0')), key)
    expect(parseCrx(crx).id).toBe(key.id)
    expect(key.id).toMatch(/^[a-p]{32}$/)

    const tampered = Buffer.from(crx)
    tampered[tampered.length - 30] ^= 0xff
    expect(() => parseCrx(tampered)).toThrow(/Chữ ký/)
    expect(() => parseCrx(Buffer.from('not a crx at all'))).toThrow()
  })

  it('parseStoreId nhận link mới, link cũ và ID trần', () => {
    const id = 'nkbihfbeogaeaoehlefnkodbefgpgknn'
    expect(parseStoreId(`https://chromewebstore.google.com/detail/metamask/${id}`)).toBe(id)
    expect(parseStoreId(`https://chrome.google.com/webstore/detail/metamask/${id}?hl=vi`)).toBe(id)
    expect(parseStoreId(id)).toBe(id)
    expect(parseStoreId('https://example.com/abc')).toBeNull()
  })
})

describe('extensionService', () => {
  it('thêm từ CRX: đúng ID, ghi key vào manifest, đọc tên theo _locales, quyền, icon', () => {
    const key = newKey()
    const ext = svc.addFromPath(file('a.crx', buildCrx3(makeZip(sampleExtension('1.2.3')), key)))
    expect(ext).toMatchObject({
      id: key.id,
      name: 'Isola Probe',
      version: '1.2.3',
      source: 'file',
      enabled: true,
      scope: 'all',
      permissions: ['storage', 'https://*.example.com/*']
    })
    expect(ext.icon).toMatch(/^data:image\/png;base64,/)

    const [dir] = svc.dirsForProfile(profiles.create({ name: 'P', lab: true }).id)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest.key).toBe(key.publicDer.toString('base64'))
  })

  it('từ chối Manifest V2 và không để lại rác', () => {
    const zip = makeZip(sampleExtension('1.0', { manifest_version: 2 }))
    expect(() => svc.addFromPath(file('mv2.zip', zip))).toThrow(expect.objectContaining({ code: 'EXT_INVALID', message: expect.stringMatching(/Manifest V2/) }))
    expect(svc.list()).toEqual([])
    expect(readdirSync(join(dataRoot, 'extensions', '.staging'))).toEqual([])
  })

  it('chặn zip-slip', () => {
    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ manifest_version: 3, name: 'x', version: '1' })))
    const evil = zip.getEntries()[0]
    zip.addFile('placeholder.txt', Buffer.from('x'))
    zip.getEntries()[1].entryName = '../../evil.txt'
    expect(evil.entryName).toBe('manifest.json')
    expect(() => svc.addFromPath(file('slip.zip', zip.toBuffer()))).toThrow(expect.objectContaining({ code: 'EXT_INVALID' }))
    expect(existsSync(join(dataRoot, 'evil.txt'))).toBe(false)
    expect(existsSync(join(dataRoot, 'extensions', 'evil.txt'))).toBe(false)
  })

  it('zip có thư mục bọc ngoài và không có key: sinh key; cập nhật từ zip mới giữ nguyên ID', () => {
    const wrap = (v: string) =>
      makeZip(Object.fromEntries(Object.entries(sampleExtension(v)).map(([k, c]) => [`my-ext/${k}`, c])))
    const v1 = svc.addFromPath(file('v1.zip', wrap('1.0')))
    expect(v1.id).toMatch(/^[a-p]{32}$/)

    const v2 = svc.updateFromPath(v1.id, file('v2.zip', wrap('2.0')))
    expect(v2).toMatchObject({ id: v1.id, version: '2.0' })
    expect(svc.list()).toHaveLength(1)

    // Bản 1.0 còn trên đĩa tới khi dọn lúc khởi động.
    expect(readdirSync(join(dataRoot, 'extensions', v1.id))).toHaveLength(2)
    svc.cleanup()
    expect(readdirSync(join(dataRoot, 'extensions', v1.id))).toEqual([expect.stringMatching(/^2\.0-/)])
  })

  it('cập nhật bằng CRX khóa khác thì báo lệch ID', () => {
    const ext = svc.addFromPath(file('a.crx', buildCrx3(makeZip(sampleExtension('1.0')), newKey())))
    const other = file('b.crx', buildCrx3(makeZip(sampleExtension('2.0')), newKey()))
    expect(() => svc.updateFromPath(ext.id, other)).toThrow(expect.objectContaining({ code: 'EXT_ID_MISMATCH' }))
    expect(svc.get(ext.id).version).toBe('1.0')
  })

  it('thêm từ thư mục đã giải nén', () => {
    const src = join(dataRoot, 'src-ext')
    for (const [name, content] of Object.entries(sampleExtension('3.1'))) {
      mkdirSync(join(src, name, '..'), { recursive: true })
      writeFileSync(join(src, name), content)
    }
    expect(svc.addFromPath(src)).toMatchObject({ name: 'Isola Probe', version: '3.1' })
  })

  it('phạm vi: tất cả / theo nhóm / theo profile / tắt', () => {
    const g = profiles.createGroup('Shop')
    const a = profiles.create({ name: 'A', lab: true, groupId: g.id })
    const b = profiles.create({ name: 'B', lab: true })
    const ext = svc.addFromPath(file('a.crx', buildCrx3(makeZip(sampleExtension('1.0')), newKey())))
    const count = (id: string) => svc.dirsForProfile(id).length

    expect([count(a.id), count(b.id)]).toEqual([1, 1])
    svc.update(ext.id, { scope: 'groups', groupIds: [g.id] })
    expect([count(a.id), count(b.id)]).toEqual([1, 0])
    svc.update(ext.id, { scope: 'profiles', profileIds: [b.id] })
    expect([count(a.id), count(b.id)]).toEqual([0, 1])
    svc.update(ext.id, { enabled: false })
    expect([count(a.id), count(b.id)]).toEqual([0, 0])

    // Xóa nhóm / xóa vĩnh viễn profile thì gỡ luôn khỏi danh sách gán.
    svc.update(ext.id, { enabled: true, groupIds: [g.id] })
    profiles.removeGroup(g.id)
    profiles.archive(b.id)
    profiles.purge(b.id, true)
    expect(svc.get(ext.id)).toMatchObject({ groupIds: [], profileIds: [] })
  })

  it('Web Store: tải theo link, kiểm cập nhật', async () => {
    const key = newKey()
    let latest = '1.0'
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, 'http://x')
      if (url.pathname === '/file.crx') {
        res.end(buildCrx3(makeZip(sampleExtension(latest)), key))
      } else if (url.searchParams.get('response') === 'redirect') {
        expect(url.searchParams.get('x')).toContain(`id=${key.id}`)
        res.writeHead(302, { Location: '/file.crx' }).end()
      } else {
        res.end(`<?xml version="1.0"?><gupdate><app appid="${key.id}"><updatecheck status="ok" version="${latest}" codebase="x"/></app></gupdate>`)
      }
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/crx`
    const store = new ExtensionService(db, join(dataRoot, 'extensions'), { prodVersion: '155.0.8059.39', storeBaseUrl: base })
    try {
      const ext = await store.addFromStore(`https://chromewebstore.google.com/detail/isola-probe/${key.id}?hl=vi`)
      expect(ext).toMatchObject({ id: key.id, version: '1.0', source: 'store' })
      expect(await store.checkUpdates()).toEqual([{ id: key.id, current: '1.0', latest: null }])

      latest = '1.1'
      expect(await store.checkUpdates()).toEqual([{ id: key.id, current: '1.0', latest: '1.1' }])
      expect((await store.updateFromStore(key.id)).version).toBe('1.1')
    } finally {
      server.close()
    }
  })
})
