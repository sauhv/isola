import { randomUUID } from 'node:crypto'
import type { Db } from '../db'
import type { CookieParam } from '../engine/cookies'
import type { SecretBox } from './secretBox'

/**
 * Cookie nhập lúc tạo/sửa profile: lưu mã hóa (safeStorage) trong cookies_import,
 * áp vào trình duyệt qua CDP ở lần mở kế tiếp rồi xóa. Không bao giờ ghi log nội dung cookie.
 */
export class CookieService {
  constructor(
    private readonly db: Db,
    private readonly secrets: SecretBox
  ) {}

  stage(profileId: string, cookies: CookieParam[]): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM cookies_import WHERE profile_id = ?').run(profileId)
      if (cookies.length === 0) return
      this.db
        .prepare('INSERT INTO cookies_import (id, profile_id, payload_enc, updated_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), profileId, this.secrets.encrypt(JSON.stringify(cookies)), new Date().toISOString())
    })()
  }

  pendingCount(profileId: string): number {
    const row = this.db.prepare('SELECT payload_enc FROM cookies_import WHERE profile_id = ?').get(profileId) as
      | { payload_enc: string }
      | undefined
    return row ? (JSON.parse(this.secrets.decrypt(row.payload_enc)) as unknown[]).length : 0
  }

  pending(profileId: string): CookieParam[] | null {
    const row = this.db.prepare('SELECT payload_enc FROM cookies_import WHERE profile_id = ?').get(profileId) as
      | { payload_enc: string }
      | undefined
    return row ? (JSON.parse(this.secrets.decrypt(row.payload_enc)) as CookieParam[]) : null
  }

  clear(profileId: string): void {
    this.db.prepare('DELETE FROM cookies_import WHERE profile_id = ?').run(profileId)
  }

  // ---------- Sao lưu cookie hiện tại (giống AdsPower: tự xuất sau khi dùng) ----------

  /** Lưu (mã hóa) ảnh chụp cookie hiện tại của profile, đọc từ trình duyệt. Rỗng thì xóa bản lưu. */
  saveBackup(profileId: string, cookies: CookieParam[]): void {
    if (cookies.length === 0) {
      this.db.prepare('DELETE FROM cookies_backup WHERE profile_id = ?').run(profileId)
      return
    }
    this.db
      .prepare(
        `INSERT INTO cookies_backup (profile_id, payload_enc, count, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(profile_id) DO UPDATE SET payload_enc = excluded.payload_enc,
           count = excluded.count, updated_at = excluded.updated_at`
      )
      .run(profileId, this.secrets.encrypt(JSON.stringify(cookies)), cookies.length, new Date().toISOString())
  }

  /** Ảnh chụp cookie đã lưu của profile (giải mã), null nếu chưa có. */
  backup(profileId: string): { count: number; updatedAt: string; cookies: CookieParam[] } | null {
    const row = this.db.prepare('SELECT payload_enc, count, updated_at FROM cookies_backup WHERE profile_id = ?').get(profileId) as
      | { payload_enc: string; count: number; updated_at: string }
      | undefined
    if (!row) return null
    return {
      count: row.count,
      updatedAt: row.updated_at,
      cookies: JSON.parse(this.secrets.decrypt(row.payload_enc)) as CookieParam[]
    }
  }

  /** Số cookie đã sao lưu (không giải mã payload). */
  backupInfo(profileId: string): { count: number; updatedAt: string } | null {
    const row = this.db.prepare('SELECT count, updated_at FROM cookies_backup WHERE profile_id = ?').get(profileId) as
      | { count: number; updated_at: string }
      | undefined
    return row ? { count: row.count, updatedAt: row.updated_at } : null
  }
}
