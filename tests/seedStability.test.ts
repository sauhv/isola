import { mkdtempSync, rmSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { DEFAULT_KERNEL_ID, SUPPORTED_KERNELS } from '../src/main/engine/kernels'
import { generateSeed } from '../src/main/engine/seed'
import { CookieService } from '../src/main/services/cookieService'
import { ExtensionService } from '../src/main/services/extensionService'
import { KernelService } from '../src/main/services/kernelService'
import { LaunchService } from '../src/main/services/launchService'
import { ProfileService } from '../src/main/services/profileService'
import { ProxyService } from '../src/main/services/proxyService'
import { fakeGeo, startHttpUpstream, testSecretBox } from './helpers/fakeNet'

const KERNEL_CACHE = join(__dirname, '.cache', 'kernels')

let dataRoot: string
let db: Db
let profiles: ProfileService
let proxies: ProxyService
let cookies: CookieService
let launcher: LaunchService
let server: http.Server
let probeUrl: string
const seenHeaders: (http.IncomingHttpHeaders & { path?: string })[] = []

// Trang thăm dò đọc những gì trình duyệt báo ra. 127.0.0.1 là ngữ cảnh an toàn nên có userAgentData.
const PROBE = `(async () => {
  while (document.readyState !== 'complete') await new Promise((r) => setTimeout(r, 50));
  const c = document.createElement('canvas'); c.width = 240; c.height = 60;
  const x = c.getContext('2d'); x.textBaseline = 'top'; x.font = '16px Arial';
  x.fillStyle = '#f60'; x.fillRect(10, 10, 100, 30); x.fillStyle = '#069'; x.fillText('Isola canvas test', 2, 15);
  const data = c.toDataURL(); let h = 0; for (let i = 0; i < data.length; i++) h = (Math.imul(h, 31) + data.charCodeAt(i)) | 0;
  const g = document.createElement('canvas').getContext('webgl'); const e = g.getExtension('WEBGL_debug_renderer_info');
  const uad = navigator.userAgentData;
  const he = uad ? await uad.getHighEntropyValues(['platformVersion', 'architecture']) : {};
  return {
    ua: navigator.userAgent, platform: navigator.platform, lang: navigator.language, langs: navigator.languages,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory,
    screen: [screen.width, screen.height, screen.availHeight, devicePixelRatio],
    webgl: g.getParameter(e.UNMASKED_RENDERER_WEBGL), canvas: h,
    brands: uad ? uad.brands.map((b) => b.brand + '/' + b.version) : null, uaPlatform: uad ? uad.platform : null,
    platformVersion: he.platformVersion || null,
    earlyPlatformVersion: window.__early || null,
    toStr: Object.getOwnPropertyDescriptor(Navigator.prototype, 'deviceMemory')?.get.toString() ?? null,
    fnToStr: Function.prototype.toString.toString(),
    illegal: (() => { try { Navigator.prototype.deviceMemory; return 'no-throw' } catch (err) { return err.constructor.name } })(),
    webdriver: navigator.webdriver
  };
})()`

async function probe(profileId: string, url: string): Promise<any> {
  const cdp = launcher.cdp(profileId)
  const deadline = Date.now() + 10_000
  let target: { targetId: string } | undefined
  while (!target && Date.now() < deadline) {
    const { targetInfos } = await cdp.send('Target.getTargets')
    target = targetInfos.find((t: any) => t.type === 'page' && t.url.startsWith(url))
    if (!target) await new Promise((r) => setTimeout(r, 100))
  }
  if (!target) throw new Error(`Không thấy tab ${url}`)
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression: PROBE, awaitPromise: true, returnByValue: true },
    sessionId
  )
  if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails))
  return result.value
}

beforeAll(async () => {
  dataRoot = mkdtempSync(join(tmpdir(), 'isola-seed-'))
  db = openDatabase(join(dataRoot, 'isola.db'))
  const kernels = new KernelService(KERNEL_CACHE)
  await kernels.install(DEFAULT_KERNEL_ID)
  profiles = new ProfileService(db, dataRoot, { host: { os: 'windows', gpuVendor: null } })
  const secrets = testSecretBox()
  proxies = new ProxyService(db, secrets, fakeGeo, { ipEndpoints: ['http://isola.test/ip'], timeoutMs: 5000 })
  cookies = new CookieService(db, secrets)
  const extensions = new ExtensionService(db, join(dataRoot, 'extensions'), { prodVersion: '155.0.8059.39' })
  launcher = new LaunchService({ db, dataRoot, profiles, kernels, proxies, extensions, cookies }, { extraArgs: process.env.ISOLA_TEST_HEADFUL ? [] : ['--headless=new'] })

  server = http.createServer((req, res) => {
    seenHeaders.push({ ...req.headers, path: req.url })
    res.setHeader('Accept-CH', 'Sec-CH-UA-Platform-Version')
    // Script trong <head> gọi high-entropy hints sớm nhất có thể, như nhiều trình kiểm fingerprint.
    res.end(
      '<!doctype html><title>probe</title><script>navigator.userAgentData && navigator.userAgentData' +
        '.getHighEntropyValues(["platformVersion"]).then((v) => { window.__early = v.platformVersion })</script><p>probe</p>'
    )
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  probeUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/probe`
}, 600_000)

afterAll(async () => {
  await launcher?.stopAll()
  server?.close()
  db?.close()
  rmSync(dataRoot, { recursive: true, force: true })
})

describe('seed stability (SPEC-003 §13)', () => {
  it('mở cùng profile 3 lần: seed không đổi; UA, WebGL, canvas hash, timezone không đổi và đúng seed', async () => {
    const p = profiles.create({
      name: 'stable',
      lab: true,
      startUrls: [probeUrl],
      // Chọn thiết bị Windows 11 để platformVersion khác Windows 10 thật của máy test.
      fingerprint: generateSeed({ os: 'windows', gpuVendor: null }, SUPPORTED_KERNELS[0], { catalogId: 'win11-nvidia-gtx1650-1536' })
    })
    const seedBefore = db.prepare('SELECT f.seed_json FROM fingerprints f JOIN profiles p ON p.fingerprint_id = f.id WHERE p.id = ?').get(p.id)
    const { seed } = profiles.getFingerprint(p.id)

    const runs: any[] = []
    for (let i = 0; i < 3; i++) {
      await launcher.start(p.id)
      runs.push(await probe(p.id, probeUrl))
      await launcher.stop(p.id)
    }
    const seedAfter = db.prepare('SELECT f.seed_json FROM fingerprints f JOIN profiles p ON p.fingerprint_id = f.id WHERE p.id = ?').get(p.id)
    expect(seedAfter).toEqual(seedBefore)
    expect(runs[1]).toEqual(runs[0])
    expect(runs[2]).toEqual(runs[0])

    const r = runs[0]
    expect(r.ua).toBe(seed.userAgent)
    expect(r.platform).toBe(seed.platform)
    expect(r.tz).toBe(seed.timezone)
    expect(r.lang).toBe(seed.language)
    expect(r.langs).toEqual(seed.languages)
    expect(r.cores).toBe(seed.hardware.cores)
    expect(r.mem).toBe(seed.hardware.memoryGb)
    expect(r.screen.slice(0, 2)).toEqual([seed.screen.width, seed.screen.height])
    expect(r.screen[3]).toBe(seed.screen.dpr)
    expect(r.webgl).toBe(seed.webgl.renderer)
    expect(r.brands).toEqual(['Google Chrome/155', 'Chromium/155', 'Not(A:Brand/24'])
    expect(r.uaPlatform).toBe('Windows')
    // Hàm ghi đè trông như hàm native và ném lỗi như bản gốc.
    expect(r.toStr).toBe('function get deviceMemory() { [native code] }')
    expect(r.fnToStr).toBe('function toString() { [native code] }')
    expect(r.illegal).toBe('TypeError')
    expect(r.webdriver).toBe(false)
    expect(r.platformVersion).toBe('15.0.0')
    expect(r.earlyPlatformVersion).toBe('15.0.0')

    // Header HTTP cũng khớp: UA và Client Hints cùng nguồn.
    const h = seenHeaders.find((x) => x.path === '/probe')
    expect(h, 'request phải mang UA của seed').toBeTruthy()
    expect(h!['sec-ch-ua']).toContain('"Google Chrome";v="155"')
    expect(h!['sec-ch-ua-platform']).toBe('"Windows"')
    expect(h!['accept-language']).toBe('en-US,en;q=0.9')
  }, 180_000)

  it('hai profile khác seed có canvas hash khác nhau', async () => {
    const a = profiles.create({ name: 'canvas-a', lab: true, startUrls: [probeUrl] })
    const b = profiles.create({ name: 'canvas-b', lab: true, startUrls: [probeUrl] })
    await launcher.start(a.id)
    await launcher.start(b.id)
    const [ra, rb] = [await probe(a.id, probeUrl), await probe(b.id, probeUrl)]
    await launcher.stopAll()
    expect(ra.canvas).not.toBe(rb.canvas)
  }, 120_000)

  it('profile production: timezone và ngôn ngữ theo IP proxy; cookie nhập được áp rồi xóa khỏi hàng chờ', async () => {
    const up = await startHttpUpstream('u', 'p')
    try {
      const px = proxies.create({ type: 'http', host: '127.0.0.1', port: up.port, username: 'u', password: 'p' })
      const p = profiles.create({ name: 'prod', proxyId: px.id, startUrls: ['http://isola.test/'] })
      cookies.stage(p.id, [{ name: 'imported', value: '1', domain: '.isola.test', path: '/', secure: false, httpOnly: false }])

      await launcher.start(p.id)
      const r = await probe(p.id, 'http://isola.test/')
      // Chrome dùng tên ICU cũ Asia/Saigon cho cùng múi giờ, giống Chrome thật ở Việt Nam.
      expect(['Asia/Ho_Chi_Minh', 'Asia/Saigon']).toContain(r.tz)
      expect(r.lang).toBe('vi-VN')
      expect(r.langs).toEqual(['vi-VN', 'vi', 'en-US', 'en'])

      const { cookies: jar } = await launcher.cdp(p.id).send('Storage.getCookies')
      expect(jar.map((c: any) => c.name)).toContain('imported')
      expect(cookies.pending(p.id)).toBeNull()
      await launcher.stop(p.id)
    } finally {
      await up.close()
    }
  }, 120_000)
})
