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
}
