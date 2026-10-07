import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { getViaProxy } from '../src/main/engine/httpViaProxy'
import { parseProxyLine, upstreamUrl } from '../src/main/engine/proxyParse'
import { Relay } from '../src/main/engine/relay'
import { ProxyService } from '../src/main/services/proxyService'
import { deadPort, fakeGeo, startHttpUpstream, startSocksUpstream, startTarget, testSecretBox } from './helpers/fakeNet'

const PASS = 'S3cr3t-pässwörd:with-colon'

describe('parseProxyLine', () => {
  it('đọc đủ các định dạng', () => {
    expect(parseProxyLine('1.2.3.4:8080', 'http')).toMatchObject({ type: 'http', host: '1.2.3.4', port: 8080 })
    expect(parseProxyLine('1.2.3.4:8080:u:p:x', 'socks5')).toMatchObject({
      type: 'socks5',
      username: 'u',
      password: 'p:x'
    })
    expect(parseProxyLine('u:p@proxy.example.com:3128', 'http')).toMatchObject({
      host: 'proxy.example.com',
      username: 'u',
      password: 'p'
    })
    expect(parseProxyLine('socks5://us%40er:p%3Ass@h.example:1080', 'http')).toMatchObject({
      type: 'socks5',
      username: 'us@er',
      password: 'p:ss',
      port: 1080
    })
    expect(parseProxyLine('https://h.example:443/', 'http')).toMatchObject({ type: 'https', port: 443 })
  })

  it('từ chối dòng sai và không lộ nội dung dòng trong lỗi', () => {
    for (const bad of ['1.2.3.4', 'h:99999', 'ftp://h:21', 'bad host:80', 'h:80:onlyuser']) {
      let msg = ''
      try {
        parseProxyLine(bad, 'http')
      } catch (e) {
        msg = (e as Error).message
      }
      expect(msg, bad).not.toBe('')
      expect(msg).not.toContain(bad)
    }
  })

  it('upstreamUrl: socks5 → socks5h, mã hóa ký tự đặc biệt', () => {
    expect(upstreamUrl({ type: 'socks5', host: 'h', port: 1, username: 'a@b', password: 'c:d' })).toBe(
      'socks5h://a%40b:c%3Ad@h:1'
    )
    expect(upstreamUrl({ type: 'http', host: 'h', port: 2, username: null, password: null })).toBe('http://h:2')
  })
})

describe('relay', () => {
  let target: Awaited<ReturnType<typeof startTarget>>
  beforeAll(async () => {
    target = await startTarget()
  })
  afterAll(() => target.close())

  it('đi qua upstream HTTP có auth', async () => {
    const up = await startHttpUpstream('user', PASS)
    const relay = await Relay.start(upstreamUrl({ type: 'http', host: '127.0.0.1', port: up.port, username: 'user', password: PASS }))
    try {
      const r = await getViaProxy(relay.port, 'http://isola.test/ip', 5000)
      expect(r).toEqual({ status: 200, body: '203.0.113.7' })
    } finally {
      await relay.close()
      await up.close()
    }
  })

  it('sai password upstream thì lỗi, không đi thẳng', async () => {
    const up = await startHttpUpstream('user', PASS)
    const relay = await Relay.start(upstreamUrl({ type: 'http', host: '127.0.0.1', port: up.port, username: 'user', password: 'wrong' }))
    try {
      const r = await getViaProxy(relay.port, `http://127.0.0.1:${target.port}/`, 5000).catch((e) => e)
      expect(r.status ?? 0).not.toBe(200)
      expect(target.hits()).toBe(0)
    } finally {
      await relay.close()
      await up.close()
    }
  })

  it('đi qua upstream SOCKS5 có auth, tên miền phân giải phía proxy', async () => {
    const socks = await startSocksUpstream('su', PASS, target.port)
    const relay = await Relay.start(upstreamUrl({ type: 'socks5', host: '127.0.0.1', port: socks.port, username: 'su', password: PASS }))
    try {
      const before = target.hits()
      const r = await getViaProxy(relay.port, 'http://isola.test/', 5000)
      expect(r).toEqual({ status: 200, body: 'direct-hit' }) // server đích chỉ tới được qua socks
      expect(target.hits()).toBe(before + 1)
    } finally {
      await relay.close()
      await socks.close()
    }
  })

  it('kill-switch: upstream chết thì request lỗi và không có kết nối trực tiếp nào', async () => {
    const before = target.hits()
    const relay = await Relay.start(`http://127.0.0.1:${await deadPort()}`)
    try {
      const r = await getViaProxy(relay.port, `http://127.0.0.1:${target.port}/`, 5000)
      expect(r.status).toBeGreaterThanOrEqual(500)
      const s = await getViaProxy(relay.port, `https://127.0.0.1:${target.port}/`, 5000).catch((e) => e)
      expect(s).toBeInstanceOf(Error)
      expect(target.hits()).toBe(before)
    } finally {
      await relay.close()
    }
  })
})

describe('proxyService', () => {
  let dataRoot: string
  let db: Db
  let svc: ProxyService
  let up: Awaited<ReturnType<typeof startHttpUpstream>>

  beforeEach(async () => {
    dataRoot = mkdtempSync(join(tmpdir(), 'isola-px-'))
    db = openDatabase(join(dataRoot, 'isola.db'))
    up = await startHttpUpstream('user', PASS)
    svc = new ProxyService(db, testSecretBox(), fakeGeo, { ipEndpoints: ['http://isola.test/ip'], timeoutMs: 5000 })
  })
  afterEach(async () => {
    await up.close()
    db.close()
    rmSync(dataRoot, { recursive: true, force: true })
  })

  it('test(): lưu IP ra, quốc gia, timezone, độ trễ', async () => {
    const p = svc.create({ type: 'http', host: '127.0.0.1', port: up.port, username: 'user', password: PASS })
    expect(p.hasPassword).toBe(true)
    expect(JSON.stringify(p)).not.toContain(PASS)

    const t = await svc.test(p.id)
    expect(t.lastCheck).toMatchObject({ ip: '203.0.113.7', country: 'VN', timezone: 'Asia/Ho_Chi_Minh', error: null })
    expect(t.lastCheck!.latencyMs).toBeGreaterThanOrEqual(0)
    expect(svc.isCheckFresh(t)).toBe(true)
  })

  it('test() lỗi: lưu lỗi, không lộ password, không còn fresh', async () => {
    const p = svc.create({ type: 'http', host: '127.0.0.1', port: await deadPort(), username: 'user', password: PASS })
    const t = await svc.test(p.id)
    expect(t.lastCheck?.error).toBeTruthy()
    expect(t.lastCheck?.error).not.toContain(PASS)
    expect(svc.isCheckFresh(t)).toBe(false)
  })

  it('đổi host thì xóa kết quả kiểm cũ', async () => {
    const p = svc.create({ type: 'http', host: '127.0.0.1', port: up.port, username: 'user', password: PASS })
    await svc.test(p.id)
    expect(svc.update(p.id, { port: 1 }).lastCheck).toBeNull()
    expect(svc.update(p.id, { label: 'x' }).label).toBe('x')
  })

  it('import: dòng tốt được tạo, dòng lỗi trả về theo số dòng', () => {
    const r = svc.import(['1.1.1.1:80', '', '# ghi chú', 'rác', 'u:p@2.2.2.2:81', 'socks5://3.3.3.3:1080'].join('\n'), 'http')
    expect(r.created).toBe(3)
    expect(r.errors).toEqual([{ line: 4, reason: expect.any(String) }])
    expect(svc.list().map((p) => p.type).sort()).toEqual(['http', 'http', 'socks5'])
  })

  it('import: tối đa 500 dòng', () => {
    const lines = Array.from({ length: 502 }, (_, i) => `10.0.${Math.floor(i / 250)}.${i % 250}:80`)
    const r = svc.import(lines.join('\n'), 'http')
    expect(r.created).toBe(500)
    expect(r.errors).toHaveLength(2)
  })

  it('password không nằm plaintext trong file SQLite (kể cả WAL)', () => {
    svc.create({ type: 'http', host: 'h.example', port: 80, username: 'user', password: PASS })
    svc.import(`9.9.9.9:80:user2:${PASS}`, 'http')
    const needle = Buffer.from(PASS, 'utf8')
    for (const f of readdirSync(dataRoot)) {
      expect(readFileSync(join(dataRoot, f)).includes(needle), f).toBe(false)
    }
    expect(svc.upstreamUrl(svc.list()[0].id)).toContain(encodeURIComponent(PASS))
  })

  it('không xóa proxy đang gán cho profile', () => {
    const p = svc.create({ type: 'http', host: 'h.example', port: 80 })
    db.prepare(
      `INSERT INTO fingerprints (id, seed_json, catalog_id, created_at) VALUES ('f', '{}', 'x', 'now');`
    ).run()
    db.prepare(
      `INSERT INTO profiles (id, serial, name, kernel, fingerprint_id, proxy_id, created_at, updated_at)
       VALUES ('p', 1, 'A', 'cft-155', 'f', ?, 'now', 'now')`
    ).run(p.id)
    expect(() => svc.remove(p.id)).toThrow(expect.objectContaining({ code: 'PROXY_IN_USE' }))
  })
})
