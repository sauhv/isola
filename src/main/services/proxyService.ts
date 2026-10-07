import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import type { Proxy, ProxyCheck, ProxyImportResult, ProxyInput, ProxyPatch, ProxyType } from '../../shared/types'
import type { Db } from '../db'
import { getViaProxy } from '../engine/httpViaProxy'
import { parseProxyLine, ProxyParseError, upstreamUrl } from '../engine/proxyParse'
import { Relay } from '../engine/relay'
import { IsolaError } from '../errors'
import type { GeoLookup } from './geoService'
import type { SecretBox } from './secretBox'

export const PROXY_CHECK_MAX_AGE_MS = 6 * 60 * 60 * 1000
const CHECK_TIMEOUT_MS = 15_000
const IMPORT_MAX_LINES = 500
const TEST_CONCURRENCY = 10

export interface ProxyServiceOptions {
  /** Endpoint trả IP ra dạng text. Thử lần lượt. Test đổi sang endpoint giả local. */
  ipEndpoints?: string[]
  timeoutMs?: number
}

type ProxyRow = {
  id: string
  label: string
  type: ProxyType
  host: string
  port: number
  username: string | null
  password_enc: string | null
  refresh_url: string | null
  last_check_ip: string | null
  last_check_tz: string | null
  last_check_country: string | null
  last_check_city: string | null
  last_check_latency_ms: number | null
  last_check_error: string | null
  last_check_at: string | null
  created_at: string
  profile_count: number
}

const SELECT_PROXY = `
  SELECT x.*, (SELECT COUNT(*) FROM profiles p WHERE p.proxy_id = x.id AND p.deleted_at IS NULL) AS profile_count
  FROM proxies x`

export class ProxyService {
  private readonly ipEndpoints: string[]
  private readonly timeoutMs: number

  constructor(
    private readonly db: Db,
    private readonly secrets: SecretBox,
    private readonly geo: GeoLookup,
    options: ProxyServiceOptions = {}
  ) {
    this.ipEndpoints = options.ipEndpoints ?? ['https://api.ipify.org', 'https://icanhazip.com']
    this.timeoutMs = options.timeoutMs ?? CHECK_TIMEOUT_MS
  }

  list(): Proxy[] {
    return (this.db.prepare(`${SELECT_PROXY} ORDER BY x.created_at DESC`).all() as ProxyRow[]).map(toProxy)
  }

  get(id: string): Proxy {
    return toProxy(this.row(id))
  }

  create(input: ProxyInput): Proxy {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO proxies (id, label, type, host, port, username, password_enc, refresh_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.label?.trim() || `${input.host}:${input.port}`,
        input.type,
        input.host.trim(),
        input.port,
        input.username || null,
        input.password ? this.secrets.encrypt(input.password) : null,
        input.refreshUrl || null,
        new Date().toISOString()
      )
    return this.get(id)
  }

  update(id: string, patch: ProxyPatch): Proxy {
    const current = this.row(id)
    const sets: string[] = []
    const args: unknown[] = []
    const set = (col: string, v: unknown) => {
      sets.push(`${col} = ?`)
      args.push(v)
    }
    if (patch.label !== undefined) set('label', patch.label.trim() || `${patch.host ?? current.host}:${patch.port ?? current.port}`)
    if (patch.type !== undefined) set('type', patch.type)
    if (patch.host !== undefined) set('host', patch.host.trim())
    if (patch.port !== undefined) set('port', patch.port)
    if (patch.username !== undefined) set('username', patch.username || null)
    if (patch.password !== undefined) set('password_enc', patch.password ? this.secrets.encrypt(patch.password) : null)
    if (patch.refreshUrl !== undefined) set('refresh_url', patch.refreshUrl || null)

    // Đổi điểm đến hoặc thông tin đăng nhập thì kết quả kiểm cũ không còn đúng.
    const endpointChanged = ['type', 'host', 'port', 'username', 'password'].some(
      (k) => patch[k as keyof ProxyPatch] !== undefined
    )
    if (endpointChanged) {
      for (const col of ['last_check_ip', 'last_check_tz', 'last_check_country', 'last_check_city', 'last_check_latency_ms', 'last_check_error', 'last_check_at'])
        set(col, null)
    }
    if (sets.length) this.db.prepare(`UPDATE proxies SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
    return this.get(id)
  }

  remove(id: string): void {
    const p = this.get(id)
    if (p.profileCount > 0) throw new IsolaError('PROXY_IN_USE', `Proxy đang gán cho ${p.profileCount} profile`)
    // Profile đã lưu trữ vẫn có thể trỏ tới proxy này: gỡ trước khi xóa.
    this.db.transaction(() => {
      this.db.prepare('UPDATE profiles SET proxy_id = NULL WHERE proxy_id = ?').run(id)
      this.db.prepare('DELETE FROM proxies WHERE id = ?').run(id)
    })()
  }

  /** Mỗi dòng một proxy, tối đa 500 dòng. Dòng lỗi bỏ qua và trả về, không làm hỏng cả lô. */
  import(text: string, defaultType: ProxyType): ProxyImportResult {
    const lines = text.split(/\r?\n/)
    const errors: ProxyImportResult['errors'] = []
    const parsed: ProxyInput[] = []
    let nonEmpty = 0
    lines.forEach((line, i) => {
      if (!line.trim() || line.trim().startsWith('#')) return
      nonEmpty++
      if (nonEmpty > IMPORT_MAX_LINES) {
        errors.push({ line: i + 1, reason: `vượt quá ${IMPORT_MAX_LINES} dòng` })
        return
      }
      try {
        parsed.push(parseProxyLine(line, defaultType))
      } catch (err) {
        errors.push({ line: i + 1, reason: err instanceof ProxyParseError ? err.message : 'không đọc được' })
      }
    })
    this.db.transaction(() => parsed.forEach((p) => this.create(p)))()
    return { created: parsed.length, errors }
  }

  /** URL upstream có password giải mã. Chỉ dùng trong bộ nhớ để mở relay. */
  upstreamUrl(id: string): string {
    const r = this.row(id)
    return upstreamUrl({
      type: r.type,
      host: r.host,
      port: r.port,
      username: r.username,
      password: r.password_enc ? this.secrets.decrypt(r.password_enc) : null
    })
  }

  /** Kiểm qua relay giống hệt đường trình duyệt đi: lấy IP ra, tra geo offline, đo độ trễ. */
  async test(id: string): Promise<Proxy> {
    const url = this.upstreamUrl(id)
    let check: ProxyCheck
    const at = new Date().toISOString()
    const relay = await Relay.start(url)
    try {
      const started = Date.now()
      const ip = await this.fetchIp(relay.port)
      const latencyMs = Date.now() - started
      const geo = this.geo.lookup(ip)
      check = {
        ip,
        country: geo?.country ?? null,
        city: geo?.city ?? null,
        timezone: geo?.timezone ?? null,
        latencyMs,
        error: null,
        at
      }
    } catch (err) {
      check = { ip: null, country: null, city: null, timezone: null, latencyMs: null, error: errMessage(err), at }
    } finally {
      await relay.close()
    }
    this.saveCheck(id, check)
    return this.get(id)
  }

  async testMany(ids: string[]): Promise<Proxy[]> {
    const queue = [...ids]
    const results: Proxy[] = []
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) results.push(await this.test(id))
    }
    await Promise.all(Array.from({ length: Math.min(TEST_CONCURRENCY, ids.length) }, worker))
    return results
  }

  /** Gọi refresh URL của nhà cung cấp proxy xoay (gọi trực tiếp, đây là API của nhà cung cấp), rồi kiểm lại. */
  async refreshIp(id: string): Promise<Proxy> {
    const r = this.row(id)
    if (!r.refresh_url) throw new IsolaError('NO_REFRESH_URL')
    const res = await fetch(r.refresh_url, { signal: AbortSignal.timeout(this.timeoutMs) }).catch((e) => {
      throw new IsolaError('REFRESH_FAILED', errMessage(e))
    })
    if (!res.ok) throw new IsolaError('REFRESH_FAILED', `HTTP ${res.status}`)
    // Nhà cung cấp cần vài giây để đổi IP.
    await new Promise((r) => setTimeout(r, 3000))
    return this.test(id)
  }

  /** Kết quả kiểm còn dùng được để mở profile không. */
  isCheckFresh(p: Proxy): boolean {
    return !!p.lastCheck && !p.lastCheck.error && Date.now() - Date.parse(p.lastCheck.at) < PROXY_CHECK_MAX_AGE_MS
  }

  private async fetchIp(relayPort: number): Promise<string> {
    let lastErr: unknown
    for (const endpoint of this.ipEndpoints) {
      try {
        const res = await getViaProxy(relayPort, endpoint, this.timeoutMs)
        if (res.status !== 200) throw new Error(relayStatusText(res.status))
        const ip = res.body.trim()
        if (!isIP(ip)) throw new Error('Phản hồi không phải địa chỉ IP')
        return ip
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr
  }

  private saveCheck(id: string, c: ProxyCheck): void {
    this.db
      .prepare(
        `UPDATE proxies SET last_check_ip = ?, last_check_tz = ?, last_check_country = ?, last_check_city = ?,
           last_check_latency_ms = ?, last_check_error = ?, last_check_at = ? WHERE id = ?`
      )
      .run(c.ip, c.timezone, c.country, c.city, c.latencyMs, c.error, c.at, id)
  }

  private row(id: string): ProxyRow {
    const r = this.db.prepare(`${SELECT_PROXY} WHERE x.id = ?`).get(id) as ProxyRow | undefined
    if (!r) throw new IsolaError('NOT_FOUND', `Không có proxy ${id}`)
    return r
  }
}

/** Mã lỗi relay (proxy-chain) và upstream → câu tiếng Việt. */
const RELAY_STATUS: Record<number, string> = {
  407: 'Sai username/password proxy',
  502: 'Proxy không chuyển tiếp được (502)',
  504: 'Proxy quá thời gian phản hồi',
  590: 'Proxy trả lỗi khi kết nối tới đích',
  593: 'Không phân giải được tên miền của proxy',
  594: 'Proxy từ chối kết nối (sai host/port hoặc proxy đang tắt)',
  595: 'Kết nối tới proxy bị ngắt',
  596: 'Kết nối tới proxy bị ngắt',
  597: 'Sai username/password proxy',
  599: 'Lỗi không xác định từ proxy'
}

function relayStatusText(status: number): string {
  return RELAY_STATUS[status] ?? `Proxy trả HTTP ${status}`
}

function errMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const code = /HTTP (\d{3})/.exec(raw)
  const msg = code ? relayStatusText(Number(code[1])) : raw
  // Phòng hờ: không để URL có user:pass lọt vào thông báo lưu DB.
  return msg.replace(/([a-z0-9]+:\/\/)[^@\s/]+@/gi, '$1***@').slice(0, 300)
}

function toProxy(r: ProxyRow): Proxy {
  return {
    id: r.id,
    label: r.label,
    type: r.type,
    host: r.host,
    port: r.port,
    username: r.username,
    hasPassword: !!r.password_enc,
    refreshUrl: r.refresh_url,
    lastCheck: r.last_check_at
      ? {
          ip: r.last_check_ip,
          country: r.last_check_country,
          city: r.last_check_city,
          timezone: r.last_check_tz,
          latencyMs: r.last_check_latency_ms,
          error: r.last_check_error,
          at: r.last_check_at
        }
      : null,
    profileCount: r.profile_count,
    createdAt: r.created_at
  }
}
