import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Extension, ExtensionPatch, ExtensionScope, ExtensionUpdateInfo } from '../../shared/types'
import type { Db } from '../db'
import { CrxError, parseCrx } from '../engine/crx'
import { copyFolder, ExtensionPackageError, extractZip, finalizeManifest, listDirs } from '../engine/extensionPackage'
import { IsolaError } from '../errors'

const MAX_PACKAGE_BYTES = 300 * 1024 * 1024
const STAGING = '.staging'

export interface ExtensionServiceOptions {
  /** Endpoint cập nhật của Chrome Web Store. Test thay bằng server local. */
  storeBaseUrl?: string
  /** Phiên bản Chrome gửi kèm khi tải từ Web Store (bằng kernel đang dùng). */
  prodVersion: string
}

type ExtensionRow = {
  id: string
  name: string
  version: string
  description: string | null
  source: 'store' | 'file'
  public_key: string
  dir: string
  permissions: string
  icon: string | null
  enabled: number
  scope: ExtensionScope
  created_at: string
  updated_at: string
}

/** Lấy ID 32 ký tự a–p từ URL Chrome Web Store hoặc từ chính ID. */
export function parseStoreId(input: string): string | null {
  const m = /(?:^|[/?=])([a-p]{32})(?:$|[/?#&])/.exec(input.trim())
  return m ? m[1] : null
}

/**
 * Extension center: lưu bản gốc chỉ đọc trong `{dataRoot}/extensions/{id}/{version-rand}`,
 * dùng chung cho mọi profile; dữ liệu của extension nằm trong user-data của từng profile.
 */
export class ExtensionService {
  private readonly storeBaseUrl: string

  constructor(
    private readonly db: Db,
    private readonly root: string,
    private readonly options: ExtensionServiceOptions
  ) {
    this.storeBaseUrl = options.storeBaseUrl ?? 'https://clients2.google.com/service/update2/crx'
    mkdirSync(root, { recursive: true })
  }

  list(): Extension[] {
    const rows = this.db.prepare('SELECT * FROM extensions ORDER BY name COLLATE NOCASE').all() as ExtensionRow[]
    return rows.map((r) => this.toExtension(r))
  }

  get(id: string): Extension {
    return this.toExtension(this.row(id))
  }

  async addFromStore(input: string): Promise<Extension> {
    const id = parseStoreId(input)
    if (!id) throw new IsolaError('EXT_INVALID', 'Không tìm thấy ID extension trong link Chrome Web Store')
    const crx = await this.downloadFromStore(id)
    return this.installCrx(crx, 'store', id)
  }

  /** Thêm từ file .crx, .zip hoặc thư mục đã giải nén. */
  addFromPath(path: string): Extension {
    return this.installPath(path)
  }

  /** Cập nhật extension từ file mới. Bắt buộc cùng ID; zip/thư mục không có key thì dùng key đã lưu. */
  updateFromPath(id: string, path: string): Extension {
    const row = this.row(id)
    return this.installPath(path, { expectedId: id, publicKey: Buffer.from(row.public_key, 'base64') })
  }

  async updateFromStore(id: string): Promise<Extension> {
    const row = this.row(id)
    if (row.source !== 'store') throw new IsolaError('EXT_NOT_STORE')
    return this.installCrx(await this.downloadFromStore(id), 'store', id)
  }

  /** So phiên bản đang có với Web Store. `latest` = null nếu đã mới nhất hoặc không kiểm được. */
  async checkUpdates(): Promise<ExtensionUpdateInfo[]> {
    const rows = (this.db.prepare("SELECT id, version FROM extensions WHERE source = 'store'").all() as {
      id: string
      version: string
    }[])
    return Promise.all(
      rows.map(async (r) => {
        const url = `${this.storeBaseUrl}?prodversion=${this.options.prodVersion}&acceptformat=crx3&x=${encodeURIComponent(
          `id=${r.id}&v=${r.version}&uc`
        )}`
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
          const xml = res.ok ? await res.text() : ''
          const tag = /<updatecheck\b[^>]*>/.exec(xml)?.[0] ?? ''
          const status = /\bstatus="([^"]+)"/.exec(tag)?.[1]
          const version = /\bversion="([^"]+)"/.exec(tag)?.[1] ?? null
          const latest = status === 'ok' && version && compareVersions(version, r.version) > 0 ? version : null
          return { id: r.id, current: r.version, latest }
        } catch {
          return { id: r.id, current: r.version, latest: null }
        }
      })
    )
  }

  update(id: string, patch: ExtensionPatch): Extension {
    this.row(id)
    this.db.transaction(() => {
      if (patch.enabled !== undefined) this.db.prepare('UPDATE extensions SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id)
      if (patch.scope !== undefined) this.db.prepare('UPDATE extensions SET scope = ? WHERE id = ?').run(patch.scope, id)
      const replace = (kind: 'group' | 'profile', ids: string[]) => {
        this.db.prepare('DELETE FROM extension_targets WHERE extension_id = ? AND kind = ?').run(id, kind)
        const ins = this.db.prepare('INSERT OR IGNORE INTO extension_targets (extension_id, kind, target_id) VALUES (?, ?, ?)')
        const table = kind === 'group' ? 'groups' : 'profiles'
        for (const t of new Set(ids)) {
          if (!this.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(t)) throw new IsolaError('NOT_FOUND', `Không có ${kind} ${t}`)
          ins.run(id, kind, t)
        }
      }
      if (patch.groupIds !== undefined) replace('group', patch.groupIds)
      if (patch.profileIds !== undefined) replace('profile', patch.profileIds)
      this.db.prepare('UPDATE extensions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
    })()
    return this.get(id)
  }

  /** Xóa khỏi Isola. Dữ liệu extension trong user-data của profile vẫn còn (Chrome giữ theo ID). */
  remove(id: string): void {
    this.row(id)
    this.db.prepare('DELETE FROM extensions WHERE id = ?').run(id)
    // Profile đang chạy có thể còn khóa file; phần còn sót được dọn ở lần khởi động sau.
    rmSync(join(this.root, id), { recursive: true, force: true, maxRetries: 2 })
  }

  /** Thư mục các extension mà profile được nạp, theo phạm vi gán và trạng thái bật. */
  dirsForProfile(profileId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT e.dir FROM extensions e JOIN profiles p ON p.id = ?
         WHERE e.enabled = 1 AND (
           e.scope = 'all'
           OR (e.scope = 'groups' AND EXISTS (SELECT 1 FROM extension_targets t
                 WHERE t.extension_id = e.id AND t.kind = 'group' AND t.target_id = p.group_id))
           OR (e.scope = 'profiles' AND EXISTS (SELECT 1 FROM extension_targets t
                 WHERE t.extension_id = e.id AND t.kind = 'profile' AND t.target_id = p.id))
         ) ORDER BY e.name COLLATE NOCASE`
      )
      .all(profileId) as { dir: string }[]
    return rows.map((r) => join(this.root, r.dir))
  }

  /** Gọi lúc khởi động (chưa profile nào chạy): xóa bản cũ, thư mục mồ côi, staging dở. */
  cleanup(): void {
    rmSync(join(this.root, STAGING), { recursive: true, force: true })
    const current = new Map(
      (this.db.prepare('SELECT id, dir FROM extensions').all() as { id: string; dir: string }[]).map((r) => [r.id, r.dir])
    )
    for (const id of listDirs(this.root)) {
      if (id === STAGING) continue
      const keep = current.get(id)
      if (!keep) {
        rmSync(join(this.root, id), { recursive: true, force: true })
        continue
      }
      for (const v of listDirs(join(this.root, id))) {
        if (`${id}/${v}` !== keep) rmSync(join(this.root, id, v), { recursive: true, force: true })
      }
    }
  }

  // ---------- nội bộ ----------

  private async downloadFromStore(id: string): Promise<Buffer> {
    const url = `${this.storeBaseUrl}?response=redirect&prodversion=${this.options.prodVersion}&acceptformat=crx2,crx3&x=${encodeURIComponent(
      `id=${id}&installsource=ondemand&uc`
    )}`
    let res: Response
    try {
      res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) })
    } catch (err) {
      throw new IsolaError('EXT_DOWNLOAD_FAILED', (err as Error).message)
    }
    if (res.status === 204 || res.status === 404) throw new IsolaError('EXT_NOT_FOUND_IN_STORE')
    if (!res.ok) throw new IsolaError('EXT_DOWNLOAD_FAILED', `HTTP ${res.status}`)
    const len = Number(res.headers.get('content-length') ?? 0)
    if (len > MAX_PACKAGE_BYTES) throw new IsolaError('EXT_INVALID', 'File extension quá lớn')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) throw new IsolaError('EXT_NOT_FOUND_IN_STORE')
    return buf
  }

  private installPath(path: string, opts: { expectedId?: string; publicKey?: Buffer } = {}): Extension {
    if (!existsSync(path)) throw new IsolaError('NOT_FOUND', 'Không thấy file')
    if (statSync(path).isDirectory()) {
      return this.installStaged((dir) => copyFolder(path, dir), 'file', opts)
    }
    if (statSync(path).size > MAX_PACKAGE_BYTES) throw new IsolaError('EXT_INVALID', 'File extension quá lớn')
    const buf = readFileSync(path)
    const ext = extname(path).toLowerCase()
    if (ext === '.crx' || buf.toString('latin1', 0, 4) === 'Cr24') return this.installCrx(buf, 'file', opts.expectedId)
    if (ext === '.zip' || buf.toString('latin1', 0, 2) === 'PK') {
      return this.installStaged((dir) => extractZip(buf, dir), 'file', opts)
    }
    throw new IsolaError('EXT_INVALID', 'Chỉ nhận .crx, .zip hoặc thư mục')
  }

  private installCrx(buf: Buffer, source: 'store' | 'file', expectedId?: string): Extension {
    let crx
    try {
      crx = parseCrx(buf)
    } catch (err) {
      if (err instanceof CrxError) throw new IsolaError('EXT_INVALID', err.message)
      throw err
    }
    if (expectedId && crx.id !== expectedId) throw new IsolaError('EXT_ID_MISMATCH')
    return this.installStaged((dir) => extractZip(crx.zip, dir), source, { expectedId, publicKey: crx.publicKey })
  }

  /** Giải nén vào staging, chuẩn hóa manifest, rồi mới chuyển vào chỗ chính. Lỗi giữa chừng không để rác. */
  private installStaged(
    fill: (dir: string) => void,
    source: 'store' | 'file',
    opts: { expectedId?: string; publicKey?: Buffer }
  ): Extension {
    const staging = join(this.root, STAGING, randomBytes(6).toString('hex'))
    mkdirSync(staging, { recursive: true })
    try {
      let info
      try {
        fill(staging)
        info = finalizeManifest(staging, opts.publicKey)
      } catch (err) {
        if (err instanceof ExtensionPackageError) throw new IsolaError('EXT_INVALID', err.message)
        throw err
      }
      if (opts.expectedId && info.id !== opts.expectedId) throw new IsolaError('EXT_ID_MISMATCH')

      const rel = `${info.id}/${info.version}-${randomBytes(3).toString('hex')}`
      mkdirSync(join(this.root, info.id), { recursive: true })
      renameSync(staging, join(this.root, rel))

      const now = new Date().toISOString()
      this.db
        .prepare(
          `INSERT INTO extensions (id, name, version, description, source, public_key, dir, permissions, icon, created_at, updated_at)
           VALUES (@id, @name, @version, @description, @source, @publicKey, @dir, @permissions, @icon, @now, @now)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version,
             description = excluded.description, source = excluded.source, public_key = excluded.public_key,
             dir = excluded.dir, permissions = excluded.permissions, icon = excluded.icon, updated_at = excluded.updated_at`
        )
        .run({
          id: info.id,
          name: info.name,
          version: info.version,
          description: info.description,
          source,
          publicKey: info.publicKey,
          dir: rel,
          permissions: JSON.stringify(info.permissions),
          icon: info.icon,
          now
        })
      return this.get(info.id)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }

  private row(id: string): ExtensionRow {
    const r = this.db.prepare('SELECT * FROM extensions WHERE id = ?').get(id) as ExtensionRow | undefined
    if (!r) throw new IsolaError('NOT_FOUND', `Không có extension ${id}`)
    return r
  }

  private toExtension(r: ExtensionRow): Extension {
    const targets = this.db
      .prepare('SELECT kind, target_id FROM extension_targets WHERE extension_id = ?')
      .all(r.id) as { kind: 'group' | 'profile'; target_id: string }[]
    return {
      id: r.id,
      name: r.name,
      version: r.version,
      description: r.description,
      source: r.source,
      permissions: JSON.parse(r.permissions),
      icon: r.icon,
      enabled: r.enabled === 1,
      scope: r.scope,
      groupIds: targets.filter((t) => t.kind === 'group').map((t) => t.target_id),
      profileIds: targets.filter((t) => t.kind === 'profile').map((t) => t.target_id),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}
