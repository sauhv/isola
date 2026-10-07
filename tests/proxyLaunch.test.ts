import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { DEFAULT_KERNEL_ID } from '../src/main/engine/kernels'
import { KernelService } from '../src/main/services/kernelService'
import { LaunchService } from '../src/main/services/launchService'
import { ProfileService } from '../src/main/services/profileService'
import { ProxyService } from '../src/main/services/proxyService'
import { deadPort, fakeGeo, startHttpUpstream, startTarget, testSecretBox } from './helpers/fakeNet'

const KERNEL_CACHE = join(__dirname, '.cache', 'kernels')
const PASS = 'p@ss:word'

let dataRoot: string
let db: Db
let profiles: ProfileService
let proxies: ProxyService
let launcher: LaunchService
let up: Awaited<ReturnType<typeof startHttpUpstream>>
let target: Awaited<ReturnType<typeof startTarget>>

/** Mở URL trong một tab mới của profile và trả về text của trang (hoặc chuỗi rỗng nếu lỗi tải). */
async function pageText(profileId: string, url: string): Promise<string> {
  const cdp = launcher.cdp(profileId)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  const loaded = new Promise<void>((resolve) => {
    const onEvent = (method: string, _p: unknown, sid?: string) => {
      if (sid === sessionId && method === 'Page.loadEventFired') {
        cdp.off('event', onEvent)
        resolve()
      }
    }
    cdp.on('event', onEvent)
  })
  await cdp.send('Page.navigate', { url }, sessionId)
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 8000))])
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText : ""', returnByValue: true }, sessionId)
  await cdp.send('Target.closeTarget', { targetId })
  return result.value as string
}

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-pl-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  const kernels = new KernelService(KERNEL_CACHE)
  await kernels.install(DEFAULT_KERNEL_ID)
  profiles = new ProfileService(db, dataRoot)
  proxies = new ProxyService(db, testSecretBox(), fakeGeo, { ipEndpoints: ['http://isola.test/ip'], timeoutMs: 5000 })
  launcher = new LaunchService(db, dataRoot, profiles, kernels, proxies, { extraArgs: ['--headless=new'] })
  up = await startHttpUpstream('user', PASS)
  target = await startTarget()
}, 600_000)

afterAll(async () => {
  await launcher?.stopAll()
  await up?.close()
  await target?.close()
  db?.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('launch với proxy', () => {
  it('profile production không có proxy thì không mở', async () => {
    const p = profiles.create({ name: 'no-proxy' })
    await expect(launcher.start(p.id)).rejects.toMatchObject({ code: 'PROXY_REQUIRED' })
    expect(launcher.isRunning(p.id)).toBe(false)
  })

  it('proxy chết thì không spawn Chrome', async () => {
    const dead = proxies.create({ type: 'http', host: '127.0.0.1', port: await deadPort() })
    const p = profiles.create({ name: 'dead-proxy', proxyId: dead.id })
    await expect(launcher.start(p.id)).rejects.toMatchObject({ code: 'PROXY_DOWN' })
    expect(launcher.isRunning(p.id)).toBe(false)
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'open'").get()).toEqual({ n: 0 })
  })

  it('Chrome đi qua proxy có auth; upstream chết thì mất mạng, không đi thẳng', async () => {
    const px = proxies.create({ type: 'http', host: '127.0.0.1', port: up.port, username: 'user', password: PASS })
    const p = profiles.create({ name: 'with-proxy', proxyId: px.id })
    await launcher.start(p.id)

    // Proxy được kiểm trước khi mở.
    expect(proxies.get(px.id).lastCheck).toMatchObject({ ip: '203.0.113.7', timezone: 'Asia/Ho_Chi_Minh' })
    expect(await pageText(p.id, 'http://isola.test/')).toContain('via-upstream')

    // Loopback bị Chrome bỏ qua proxy theo mặc định nên không dùng để thử. Tên miền thật phải qua proxy:
    // upstream chết → trang lỗi, server đích không nhận kết nối nào.
    await up.close()
    const before = target.hits()
    expect(await pageText(p.id, 'http://isola.test/again')).not.toContain('via-upstream')
    expect(target.hits()).toBe(before)

    await launcher.stop(p.id)
    up = await startHttpUpstream('user', PASS) // cho afterAll
  }, 120_000)

  it('profile lab mở được không cần proxy', async () => {
    const p = profiles.create({ name: 'lab', lab: true })
    await launcher.start(p.id)
    expect(launcher.isRunning(p.id)).toBe(true)
    await launcher.stop(p.id)
  }, 60_000)
})
