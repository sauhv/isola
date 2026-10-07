import tzlookup from '@photostructure/tz-lookup'
import { Reader, type CityResponse } from 'maxmind'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import type { GeoInfo, GeoStatus } from '../../shared/types'

export interface GeoLookup {
  /** null nếu chưa tải dữ liệu GeoIP. */
  lookup(ip: string): GeoInfo | null
}

const DB_FILE = 'dbip-city-lite.mmdb'
const META_FILE = 'meta.json'
const IDLE_UNLOAD_MS = 10 * 60 * 1000

/**
 * Tra quốc gia/thành phố/timezone của IP hoàn toàn offline.
 * Dữ liệu: DB-IP IP to City Lite (CC BY 4.0), tải theo tháng vào `{dataRoot}/geoip`.
 * Timezone suy từ tọa độ bằng tz-lookup vì bản Lite không có trường timezone.
 */
export class GeoService implements GeoLookup {
  private reader: Reader<CityResponse> | null = null
  private unloadTimer: NodeJS.Timeout | null = null
  private installing: Promise<GeoStatus> | null = null

  constructor(private readonly dir: string) {}

  status(): GeoStatus {
    const metaPath = join(this.dir, META_FILE)
    if (!existsSync(join(this.dir, DB_FILE)) || !existsSync(metaPath)) return { installed: false, version: null }
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { version: string }
    return { installed: true, version: meta.version }
  }

  lookup(ip: string): GeoInfo | null {
    const reader = this.load()
    if (!reader) return null
    const rec = reader.get(ip)
    const lat = rec?.location?.latitude
    const lon = rec?.location?.longitude
    let timezone: string | null = null
    if (typeof lat === 'number' && typeof lon === 'number') {
      try {
        timezone = tzlookup(lat, lon)
      } catch {
        timezone = null
      }
    }
    return {
      country: rec?.country?.iso_code ?? null,
      city: rec?.city?.names?.en ?? null,
      timezone
    }
  }

  install(onProgress?: (downloaded: number, total: number) => void): Promise<GeoStatus> {
    this.installing ??= this.download(onProgress).finally(() => (this.installing = null))
    return this.installing
  }

  private async download(onProgress?: (downloaded: number, total: number) => void): Promise<GeoStatus> {
    mkdirSync(this.dir, { recursive: true })
    // DB-IP phát hành đầu tháng; đầu tháng có thể chưa có bản mới thì lùi một tháng.
    const now = new Date()
    const months = [0, 1].map((back) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
    let lastError: unknown
    for (const version of months) {
      const url = `https://download.db-ip.com/free/dbip-city-lite-${version}.mmdb.gz`
      const res = await fetch(url).catch((e) => {
        lastError = e
        return null
      })
      if (!res?.ok || !res.body) {
        lastError ??= new Error(`HTTP ${res?.status} khi tải ${url}`)
        continue
      }
      const total = Number(res.headers.get('content-length') ?? 0)
      let downloaded = 0
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          downloaded += chunk.length
          onProgress?.(downloaded, total)
          cb(null, chunk)
        }
      })
      const tmp = join(this.dir, `${DB_FILE}.part`)
      await pipeline(Readable.fromWeb(res.body as any), counter, createGunzip(), createWriteStream(tmp))
      // Kiểm file đọc được trước khi thay bản cũ.
      new Reader<CityResponse>(readFileSync(tmp))
      this.unload()
      renameSync(tmp, join(this.dir, DB_FILE))
      writeFileSync(join(this.dir, META_FILE), JSON.stringify({ version }))
      return { installed: true, version }
    }
    rmSync(join(this.dir, `${DB_FILE}.part`), { force: true })
    throw lastError instanceof Error ? lastError : new Error('Không tải được dữ liệu GeoIP')
  }

  /** Nạp DB (~130 MB) khi cần, tự giải phóng sau 10 phút không dùng. */
  private load(): Reader<CityResponse> | null {
    if (!this.reader) {
      const file = join(this.dir, DB_FILE)
      if (!existsSync(file)) return null
      this.reader = new Reader<CityResponse>(readFileSync(file))
    }
    if (this.unloadTimer) clearTimeout(this.unloadTimer)
    this.unloadTimer = setTimeout(() => this.unload(), IDLE_UNLOAD_MS)
    this.unloadTimer.unref()
    return this.reader
  }

  private unload(): void {
    this.reader = null
    if (this.unloadTimer) clearTimeout(this.unloadTimer)
    this.unloadTimer = null
  }
}
