import type { ProfileImportResult, ProxyType } from '../../shared/types'
import type { Db } from '../db'
import type { CookieParam } from '../engine/cookies'
import { parseCsv, parseBool, splitMulti } from '../engine/csv'
import { parseProxyLine, ProxyParseError } from '../engine/proxyParse'
import { IsolaError } from '../errors'
import { audit } from './audit'
import type { CookieService } from './cookieService'
import type { LaunchService } from './launchService'
import type { ProfileService } from './profileService'
import type { ProxyService } from './proxyService'

/** Một proxy đóng gói kèm password giải mã. */
interface BundledProxy {
  label: string
  type: ProxyType
  host: string
  port: number
  username: string | null
  password: string | null
}

/** Một profile trong bundle: cấu hình + fingerprint + proxy + cookie, đủ để dựng lại ở máy khác. */
export interface BundledProfile {
  name: string
  groupName: string | null
  tags: string[]
  startUrls: string[]
  username: string | null
  kernel: string
  platform: string | null
  lab: boolean
  notes: string | null
  fingerprint: { catalogId: string; seed: unknown }
  proxy: BundledProxy | null
  cookies: CookieParam[] | null
}

/** Định dạng file .isola (JSON). */
export interface ProfileBundle {
  isola: 'profiles'
  version: 1
  exportedAt: string
  profiles: BundledProfile[]
}

export const BUNDLE_VERSION = 1

const SAME_SITE = new Set(['Strict', 'Lax', 'None'])

/** Giữ đúng các trường CookieParam, bỏ trường thừa của CDP (size, priority, sourceScheme...). */
function normalizeCookie(c: CookieParam): CookieParam {
  const out: CookieParam = {
    name: c.name,
    value: c.value,
    path: c.path || '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly
  }
  if (c.domain) out.domain = c.domain
  if (c.url) out.url = c.url
  if (c.sameSite && SAME_SITE.has(c.sameSite)) out.sameSite = c.sameSite
  if (typeof c.expires === 'number' && c.expires > 0) out.expires = c.expires
  return out
}

/**
 * Xuất/nhập profile ra file .isola để sao lưu và chuyển máy.
 * Bundle chứa cookie và password proxy ở dạng giải mã — người dùng được cảnh báo trước khi xuất.
 */
export class TransferService {
  constructor(
    private readonly db: Db,
    private readonly profiles: ProfileService,
    private readonly proxies: ProxyService,
    private readonly cookies: CookieService,
    private readonly launcher: LaunchService
  ) {}

  /** Gói các profile đã chọn thành bundle. Cookie lấy từ phiên đang chạy nếu mở, nếu không thì lấy cookie đang chờ nạp. */
  async export(ids: string[]): Promise<ProfileBundle> {
    const profiles: BundledProfile[] = []
    for (const id of ids) {
      const p = this.profiles.get(id)
      const fp = this.profiles.getFingerprint(id)
      const proxy = p.proxyId ? this.proxies.exportConfig(p.proxyId) : null
      let cookies: CookieParam[] | null = null
      if (this.launcher.isRunning(id)) {
        try {
          cookies = await this.launcher.exportCookies(id)
        } catch {
          cookies = this.cookies.pending(id)
        }
      } else {
        cookies = this.cookies.pending(id)
      }
      // Cookie từ CDP có nhiều trường thừa; chỉ giữ đúng CookieParam để bundle gọn và qua kiểm khi nhập.
      cookies = cookies ? cookies.map(normalizeCookie) : null
      profiles.push({
        name: p.name,
        groupName: p.groupName,
        tags: p.tags.map((t) => t.name),
        startUrls: p.startUrls,
        username: p.username,
        kernel: p.kernel,
        platform: p.platform,
        lab: p.lab,
        notes: p.notes,
        fingerprint: { catalogId: fp.catalogId, seed: fp.seed },
        proxy,
        cookies: cookies && cookies.length ? cookies : null
      })
      audit(this.db, 'profile_export', id, { cookies: cookies?.length ?? 0, hasProxy: !!proxy })
    }
    return { isola: 'profiles', version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), profiles }
  }

  /** Dựng lại các profile từ bundle. Best-effort: lỗi profile nào thì ghi cảnh báo, không chặn cả lô. */
  import(bundle: ProfileBundle): ProfileImportResult {
    const warnings: ProfileImportResult['warnings'] = []
    let imported = 0
    for (const bp of bundle.profiles) {
      const label = bp.name || '(không tên)'
      try {
        const groupId = bp.groupName ? this.resolveGroup(bp.groupName) : null
        const proxyId = bp.proxy ? this.resolveProxy(bp.proxy) : null
        const created = this.createOne(bp, groupId, proxyId, warnings)
        if (bp.cookies && bp.cookies.length) this.cookies.stage(created.id, bp.cookies)
        audit(this.db, 'profile_import', created.id, { cookies: bp.cookies?.length ?? 0, hasProxy: !!proxyId })
        imported++
      } catch (err) {
        warnings.push({ name: label, reason: err instanceof IsolaError ? err.code : String(err) })
      }
    }
    return { imported, warnings }
  }

  /**
   * Nhập profile từ CSV: mỗi dòng một profile, fingerprint sinh mới.
   * Cột (không phân biệt hoa/thường, có alias VI): name/tên, group/nhóm, tags, platform/nền tảng,
   * username, notes/ghi chú, proxy, starturls/url, lab. Lỗi dòng nào ghi cảnh báo, không chặn cả lô.
   */
  importCsv(text: string): ProfileImportResult {
    const warnings: ProfileImportResult['warnings'] = []
    const rows = parseCsv(text)
    const pick = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]
      return ''
    }
    let imported = 0
    rows.forEach((r, i) => {
      const name = pick(r, 'name', 'tên', 'ten', 't-n')
      const label = name || `dòng ${i + 2}`
      try {
        if (!name) throw new IsolaError('INVALID_INPUT', 'thiếu tên')
        const groupName = pick(r, 'group', 'nhóm', 'nhom')
        const proxyLine = pick(r, 'proxy')
        let proxyId: string | null = null
        if (proxyLine) {
          let input
          try {
            input = parseProxyLine(proxyLine, 'http')
          } catch (e) {
            throw new IsolaError('INVALID_INPUT', e instanceof ProxyParseError ? `proxy: ${e.message}` : 'proxy không đọc được')
          }
          proxyId =
            this.proxies.findByEndpoint(input.type, input.host, input.port, input.username ?? null) ??
            this.proxies.create(input).id
        }
        const lab = proxyId ? parseBool(pick(r, 'lab')) : true // không proxy ⇒ lab để mở được bằng IP máy
        const created = this.profiles.create({
          name: this.profiles.uniqueName(name),
          groupId: groupName ? this.resolveGroup(groupName) : null,
          proxyId,
          tags: splitMulti(pick(r, 'tags', 'tag')),
          startUrls: splitMulti(pick(r, 'starturls', 'url', 'urls')).filter((u) => /^https?:\/\//i.test(u)),
          username: pick(r, 'username', 'user') || null,
          notes: pick(r, 'notes', 'ghi chú', 'ghichu') || null,
          platform: pick(r, 'platform', 'nền tảng', 'nentang') || null,
          lab
        })
        audit(this.db, 'profile_import', created.id, { source: 'csv', hasProxy: !!proxyId })
        imported++
      } catch (err) {
        warnings.push({ name: label, reason: err instanceof IsolaError && err.message !== err.code ? err.message : err instanceof IsolaError ? err.code : String(err) })
      }
    })
    return { imported, warnings }
  }

  /** Tạo profile; nếu seed không hợp với máy này thì sinh seed mới và ghi cảnh báo. */
  private createOne(
    bp: BundledProfile,
    groupId: string | null,
    proxyId: string | null,
    warnings: ProfileImportResult['warnings']
  ): { id: string } {
    const name = this.profiles.uniqueName(bp.name.trim() || 'Profile')
    const base = {
      name,
      groupId,
      proxyId,
      tags: bp.tags,
      startUrls: bp.startUrls,
      username: bp.username,
      notes: bp.notes,
      platform: bp.platform,
      lab: bp.lab,
      kernel: bp.kernel
    }
    try {
      return this.profiles.create({ ...base, fingerprint: bp.fingerprint as never })
    } catch (err) {
      // Seed của máy khác (OS/GPU lệch) không qua kiểm: dựng lại với fingerprint mới.
      if (err instanceof IsolaError && (err.code === 'SEED_INVALID' || err.code === 'KERNEL_UNKNOWN')) {
        warnings.push({ name, reason: 'FINGERPRINT_REGENERATED' })
        const { kernel, ...rest } = base
        return this.profiles.create(err.code === 'KERNEL_UNKNOWN' ? rest : base)
      }
      throw err
    }
  }

  private resolveGroup(groupName: string): string {
    const found = this.profiles.listGroups().find((g) => g.name.toLowerCase() === groupName.trim().toLowerCase())
    return found ? found.id : this.profiles.createGroup(groupName).id
  }

  private resolveProxy(proxy: BundledProxy): string {
    const existing = this.proxies.findByEndpoint(proxy.type, proxy.host, proxy.port, proxy.username ?? null)
    if (existing) return existing
    return this.proxies.create({
      label: proxy.label,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password
    }).id
  }
}
