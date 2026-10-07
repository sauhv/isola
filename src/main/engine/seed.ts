import { randomInt } from 'node:crypto'
import { compatibleEntries, findCatalogEntry, type CatalogEntry, type HostInfo } from './catalog'
import { kernelByMajor, type SupportedKernel } from './kernels'
import { NOISE_MAX, NOISE_MIN, type Seed } from './seedSchema'

export class SeedError extends Error {}

export const DEFAULT_LANGUAGE = 'en-US'
export const DEFAULT_TIMEZONE = 'America/New_York'

/** UA rút gọn như Chrome thật: chỉ có major, phần còn lại là 0. */
export function buildUserAgent(os: 'windows' | 'macos', major: number): string {
  const platform = os === 'windows' ? 'Windows NT 10.0; Win64; x64' : 'Macintosh; Intel Mac OS X 10_15_7'
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

export function languagesFor(language: string): string[] {
  const base = language.split('-')[0]
  return [...new Set([language, base, 'en-US', 'en'])]
}

/**
 * Giá trị acceptLanguage cho CDP: danh sách trần "vi-VN,vi,en-US,en".
 * Chrome tự thêm hệ số q khi gửi header (thêm sẵn ở đây sẽ thành "vi;q=0.9;q=0.9").
 */
export function acceptLanguage(languages: string[]): string {
  return languages.join(',')
}

export interface SeedOptions {
  catalogId?: string
  webrtc?: Seed['webrtc']
  language?: string
  timezone?: string
}

/** Sinh seed mới từ một mục catalog dùng được trên máy (chọn ngẫu nhiên nếu không chỉ định). */
export function generateSeed(host: HostInfo, kernel: SupportedKernel, opts: SeedOptions = {}): { catalogId: string; seed: Seed } {
  const pool = compatibleEntries(host)
  let entry: CatalogEntry | undefined
  if (opts.catalogId) {
    entry = pool.find((e) => e.id === opts.catalogId)
    if (!entry) throw new SeedError('Thiết bị không có trong catalog dùng được trên máy này')
  } else {
    entry = pool[randomInt(pool.length)]
  }
  const language = opts.language ?? DEFAULT_LANGUAGE
  const seed: Seed = {
    version: 1,
    os: entry.os,
    chromeMajor: kernel.major,
    userAgent: buildUserAgent(entry.os, kernel.major),
    platform: entry.os === 'windows' ? 'Win32' : 'MacIntel',
    vendor: 'Google Inc.',
    language,
    languages: languagesFor(language),
    timezone: opts.timezone ?? DEFAULT_TIMEZONE,
    screen: { ...entry.screen, colorDepth: 24 },
    hardware: { ...entry.hardware },
    webgl: { ...entry.webgl },
    canvasNoise: randomInt(NOISE_MIN, NOISE_MAX + 1),
    audioNoise: randomInt(NOISE_MIN, NOISE_MAX + 1),
    fonts: [],
    webrtc: opts.webrtc ?? 'replace',
    mediaDevices: { ...entry.mediaDevices }
  }
  return { catalogId: entry.id, seed }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz)
  } catch {
    return false
  }
}

export function isValidLanguage(lang: string): boolean {
  if (!/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2}|-\d{3})?$/.test(lang)) return false
  try {
    return Intl.getCanonicalLocales(lang).length === 1
  } catch {
    return false
  }
}

/**
 * Chặn tổ hợp ngoài catalog (Phase 4): mọi trường phần cứng phải trùng đúng mục catalog,
 * chromeMajor phải là kernel Isola hỗ trợ, nhiễu trong 1..9999. Chỉ language/timezone (cho lab),
 * webrtc và giá trị nhiễu là được tự do.
 */
export function validateSeed(catalogId: string, seed: unknown, host?: HostInfo): Seed {
  const entry = findCatalogEntry(catalogId)
  if (!entry) throw new SeedError(`Thiết bị "${catalogId}" không có trong catalog`)
  if (host && !compatibleEntries(host).some((e) => e.id === entry.id)) {
    throw new SeedError('Thiết bị này không dùng được trên máy hiện tại (khác hệ điều hành hoặc hãng GPU)')
  }
  const s = seed as Seed
  if (!s || typeof s !== 'object' || s.version !== 1) throw new SeedError('Seed sai phiên bản')
  if (!kernelByMajor(s.chromeMajor)) throw new SeedError('kernel lệch catalog')

  const expect: Partial<Seed> = {
    os: entry.os,
    userAgent: buildUserAgent(entry.os, s.chromeMajor),
    platform: entry.os === 'windows' ? 'Win32' : 'MacIntel',
    vendor: 'Google Inc.',
    screen: { ...entry.screen, colorDepth: 24 },
    hardware: entry.hardware,
    webgl: entry.webgl,
    fonts: [],
    mediaDevices: entry.mediaDevices
  }
  for (const [k, v] of Object.entries(expect)) {
    if (JSON.stringify((s as any)[k]) !== JSON.stringify(v)) throw new SeedError(`Seed lệch catalog ở trường ${k}`)
  }
  for (const k of ['canvasNoise', 'audioNoise'] as const) {
    if (!Number.isInteger(s[k]) || s[k] < NOISE_MIN || s[k] > NOISE_MAX) throw new SeedError(`${k} phải là số nguyên 1–9999`)
  }
  if (s.webrtc !== 'replace' && s.webrtc !== 'disable') throw new SeedError('webrtc không hợp lệ')
  if (!isValidLanguage(s.language)) throw new SeedError('Ngôn ngữ không hợp lệ')
  if (JSON.stringify(s.languages) !== JSON.stringify(languagesFor(s.language))) throw new SeedError('languages lệch language')
  if (!isValidTimezone(s.timezone)) throw new SeedError('Timezone không hợp lệ')

  // Chỉ giữ các trường của Seed, bỏ mọi thứ lạ.
  return {
    version: 1,
    os: s.os,
    chromeMajor: s.chromeMajor,
    userAgent: s.userAgent,
    platform: s.platform,
    vendor: s.vendor,
    language: s.language,
    languages: [...s.languages],
    timezone: s.timezone,
    screen: { ...s.screen },
    hardware: { ...s.hardware },
    webgl: { ...s.webgl },
    canvasNoise: s.canvasNoise,
    audioNoise: s.audioNoise,
    fonts: [],
    webrtc: s.webrtc,
    mediaDevices: { ...s.mediaDevices }
  }
}

// ---------- cấu hình hiệu lực lúc mở ----------

const COUNTRY_LANGUAGE: Record<string, string> = {
  VN: 'vi-VN', US: 'en-US', GB: 'en-GB', CA: 'en-CA', AU: 'en-AU', NZ: 'en-NZ', IE: 'en-IE', IN: 'en-IN',
  SG: 'en-SG', PH: 'en-PH', ZA: 'en-ZA', DE: 'de-DE', AT: 'de-AT', CH: 'de-CH', FR: 'fr-FR', BE: 'fr-BE',
  JP: 'ja-JP', KR: 'ko-KR', CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-HK', TH: 'th-TH', ID: 'id-ID', MY: 'ms-MY',
  BR: 'pt-BR', PT: 'pt-PT', ES: 'es-ES', MX: 'es-MX', AR: 'es-AR', CO: 'es-CO', CL: 'es-CL', PE: 'es-PE',
  IT: 'it-IT', NL: 'nl-NL', RU: 'ru-RU', UA: 'uk-UA', PL: 'pl-PL', TR: 'tr-TR', SA: 'ar-SA', AE: 'ar-AE',
  EG: 'ar-EG', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI', CZ: 'cs-CZ', RO: 'ro-RO', HU: 'hu-HU',
  GR: 'el-GR', IL: 'he-IL', BD: 'bn-BD', PK: 'ur-PK', KH: 'km-KH', LA: 'lo-LA', MM: 'my-MM'
}

export function languageForCountry(country: string | null | undefined): string {
  return (country && COUNTRY_LANGUAGE[country.toUpperCase()]) || DEFAULT_LANGUAGE
}

export interface Brand {
  brand: string
  version: string
}

/**
 * Danh sách brand như Chrome thật: GREASE, Chromium, Google Chrome xếp theo hoán vị
 * chọn bởi (major mod 6), đúng thuật toán của Chromium (khớp Chrome 120 và 124 đo thực tế).
 */
export function chromeBrands(kernel: SupportedKernel, full: boolean): Brand[] {
  const v = full ? kernel.buildId : String(kernel.major)
  const greaseVersion = full ? `${kernel.grease.version}.0.0.0` : kernel.grease.version
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0]
  ]
  const order = orders[kernel.major % 6]
  const list: Brand[] = new Array(3)
  list[order[0]] = { brand: kernel.grease.brand, version: greaseVersion }
  list[order[1]] = { brand: 'Chromium', version: v }
  list[order[2]] = { brand: 'Google Chrome', version: v }
  return list
}

export interface EffectiveFingerprint {
  seed: Seed
  catalog: CatalogEntry
  timezone: string
  language: string
  languages: string[]
  acceptLanguage: string
  userAgentMetadata: {
    brands: Brand[]
    fullVersionList: Brand[]
    fullVersion: string
    platform: string
    platformVersion: string
    architecture: string
    model: string
    mobile: boolean
    bitness: string
    wow64: boolean
    formFactors: string[]
  }
}

/**
 * Cấu hình áp vào trình duyệt lúc mở. Seed không đổi; profile production lấy timezone/ngôn ngữ
 * theo IP proxy, profile lab dùng giá trị trong seed.
 */
export function effectiveFingerprint(
  catalogId: string,
  seed: Seed,
  ctx: { lab: boolean; proxyTimezone: string | null; proxyCountry: string | null }
): EffectiveFingerprint {
  const catalog = findCatalogEntry(catalogId)
  if (!catalog) throw new SeedError(`Thiết bị "${catalogId}" không có trong catalog`)
  const kernel = kernelByMajor(seed.chromeMajor)
  if (!kernel) throw new SeedError('kernel lệch catalog')

  const useProxy = !ctx.lab && !!ctx.proxyTimezone
  const timezone = useProxy ? ctx.proxyTimezone! : seed.timezone
  const language = useProxy ? languageForCountry(ctx.proxyCountry) : seed.language
  const languages = useProxy ? languagesFor(language) : seed.languages
  return {
    seed,
    catalog,
    timezone,
    language,
    languages,
    acceptLanguage: acceptLanguage(languages),
    userAgentMetadata: {
      brands: chromeBrands(kernel, false),
      fullVersionList: chromeBrands(kernel, true),
      fullVersion: kernel.buildId,
      platform: seed.os === 'windows' ? 'Windows' : 'macOS',
      platformVersion: catalog.platformVersion,
      architecture: catalog.architecture,
      model: '',
      mobile: false,
      bitness: '64',
      wow64: false,
      formFactors: ['Desktop']
    }
  }
}
