import { describe, expect, it } from 'vitest'
import { CATALOG, compatibleEntries } from '../src/main/engine/catalog'
import { parseCookies } from '../src/main/engine/cookies'
import { buildPageScript, buildWorkerScript } from '../src/main/engine/fingerprintScript'
import { SUPPORTED_KERNELS, type SupportedKernel } from '../src/main/engine/kernels'
import { chromeBrands, effectiveFingerprint, generateSeed, languageForCountry, validateSeed } from '../src/main/engine/seed'

const kernel = SUPPORTED_KERNELS[0]
const win = { os: 'windows' as const, gpuVendor: null }

describe('catalog', () => {
  it('đủ tổ hợp bắt buộc, không có iOS/Android, không quá 16 nhân, id không trùng', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(8)
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length)
    for (const e of CATALOG) {
      expect(['windows', 'macos']).toContain(e.os)
      expect(e.hardware.cores).toBeLessThanOrEqual(16)
      expect(e.availHeight).toBeLessThan(e.screen.height)
    }
    // Ba tổ hợp SPEC-003 §4 yêu cầu.
    expect(CATALOG.some((e) => e.os === 'windows' && e.webgl.renderer.includes('Intel(R) UHD') && e.screen.width === 1920)).toBe(true)
    expect(CATALOG.some((e) => e.webgl.renderer.includes('GTX 1650') && e.screen.width === 1536)).toBe(true)
    expect(CATALOG.some((e) => e.webgl.renderer.includes('Apple M1') && e.screen.width === 1440)).toBe(true)
  })

  it('lọc theo OS và hãng GPU của máy', () => {
    expect(compatibleEntries({ os: 'windows', gpuVendor: 'nvidia' }).every((e) => e.os === 'windows' && e.gpuVendor === 'nvidia')).toBe(true)
    expect(compatibleEntries({ os: 'macos', gpuVendor: 'apple' }).every((e) => e.os === 'macos')).toBe(true)
    expect(compatibleEntries(win).length).toBe(CATALOG.filter((e) => e.os === 'windows').length)
  })
})

describe('seed', () => {
  it('mọi mục catalog sinh ra seed hợp lệ, UA khớp kernel', () => {
    for (const e of CATALOG) {
      const { catalogId, seed } = generateSeed({ os: e.os, gpuVendor: null }, kernel, { catalogId: e.id })
      expect(validateSeed(catalogId, seed)).toEqual(seed)
      expect(seed.userAgent).toContain(`Chrome/${kernel.major}.0.0.0`)
      expect(seed.canvasNoise).toBeGreaterThanOrEqual(1)
      expect(seed.canvasNoise).toBeLessThanOrEqual(9999)
    }
  })

  it('chặn tổ hợp ngoài catalog', () => {
    const { catalogId, seed } = generateSeed(win, kernel, { catalogId: 'win10-intel-uhd620-1920' })
    const bad = (patch: object, id = catalogId) => () => validateSeed(id, { ...seed, ...patch })
    expect(bad({ userAgent: seed.userAgent.replace('Windows NT 10.0', 'X11; Linux x86_64') })).toThrow(/userAgent/)
    expect(bad({ webgl: { vendor: 'x', renderer: 'GeForce RTX 4090' } })).toThrow(/webgl/)
    expect(bad({ hardware: { cores: 32, memoryGb: 64 } })).toThrow(/hardware/)
    expect(bad({ chromeMajor: 154 })).toThrow(/kernel lệch catalog/)
    expect(bad({ canvasNoise: 0 })).toThrow(/canvasNoise/)
    expect(bad({ timezone: 'Mars/Base' })).toThrow(/Timezone/)
    expect(bad({}, 'ios-iphone-15')).toThrow(/không có trong catalog/)
    // Đúng catalog nhưng là thiết bị macOS trên máy Windows.
    const mac = generateSeed({ os: 'macos', gpuVendor: null }, kernel)
    expect(() => validateSeed(mac.catalogId, mac.seed, win)).toThrow(/không dùng được trên máy/)
  })

  it('brands xếp theo thuật toán GREASE của Chromium', () => {
    const k = (major: number, brand: string, version: string): SupportedKernel => ({
      id: 'x',
      major,
      buildId: `${major}.0.0.0`,
      grease: { brand, version }
    })
    // Giá trị đo trên Chrome thật.
    expect(chromeBrands(k(120, 'Not_A Brand', '8'), false).map((b) => b.brand)).toEqual(['Not_A Brand', 'Chromium', 'Google Chrome'])
    expect(chromeBrands(k(124, 'Not-A.Brand', '99'), false).map((b) => b.brand)).toEqual(['Chromium', 'Google Chrome', 'Not-A.Brand'])
    expect(chromeBrands(kernel, false)).toEqual([
      { brand: 'Google Chrome', version: '155' },
      { brand: 'Chromium', version: '155' },
      { brand: 'Not(A:Brand', version: '24' }
    ])
  })

  it('profile production lấy timezone/ngôn ngữ theo proxy; lab giữ của seed', () => {
    const { catalogId, seed } = generateSeed(win, kernel, { timezone: 'Europe/Berlin', language: 'de-DE' })
    const prod = effectiveFingerprint(catalogId, seed, { lab: false, proxyTimezone: 'Asia/Bangkok', proxyCountry: 'VN' })
    expect(prod).toMatchObject({ timezone: 'Asia/Bangkok', language: 'vi-VN', languages: ['vi-VN', 'vi', 'en-US', 'en'] })
    expect(prod.acceptLanguage).toBe('vi-VN,vi,en-US,en')
    const lab = effectiveFingerprint(catalogId, seed, { lab: true, proxyTimezone: 'Asia/Bangkok', proxyCountry: 'VN' })
    expect(lab).toMatchObject({ timezone: 'Europe/Berlin', language: 'de-DE' })
    expect(languageForCountry('ZZ')).toBe('en-US')
  })

  it('script tiêm là JavaScript hợp lệ', () => {
    const { catalogId, seed } = generateSeed(win, kernel)
    const fp = effectiveFingerprint(catalogId, seed, { lab: true, proxyTimezone: null, proxyCountry: null })
    expect(() => new Function(buildPageScript(fp))).not.toThrow()
    expect(() => new Function(buildWorkerScript(fp))).not.toThrow()
    expect(buildPageScript(fp)).not.toContain('Math.random')
  })
})

describe('cookies', () => {
  it('đọc JSON kiểu EditThisCookie và cookies.txt', () => {
    const json = parseCookies(
      JSON.stringify([
        { domain: '.example.com', name: 'sid', value: 'a1', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction', expirationDate: 1900000000.5 },
        { domain: 'app.example.com', hostOnly: true, name: 'pref', value: 'dark', path: '/', session: true }
      ])
    )
    expect(json[0]).toEqual({ name: 'sid', value: 'a1', domain: '.example.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: 1900000000 })
    expect(json[1]).toMatchObject({ name: 'pref', url: 'http://app.example.com/' })

    const txt = parseCookies('# Netscape\n.example.com\tTRUE\t/\tTRUE\t1900000000\tsid\tv=1\n#HttpOnly_example.org\tFALSE\t/\tFALSE\t0\tx\ty')
    expect(txt).toHaveLength(2)
    expect(txt[1]).toMatchObject({ name: 'x', httpOnly: true, url: 'http://example.org/' })
    expect(() => parseCookies('not cookies')).toThrow()
    expect(() => parseCookies('[{"name":"a","value":"b","domain":"bad domain"}]')).toThrow(/domain/)
  })
})
