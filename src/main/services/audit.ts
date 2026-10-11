import { randomUUID } from 'node:crypto'
import type { Db } from '../db'

export type AuditAction =
  | 'create'
  | 'open'
  | 'close'
  | 'proxy_change'
  | 'seed_rotate'
  | 'cookie_export'
  | 'profile_export'
  | 'profile_import'
  | 'archive'
  | 'purge'

/** `detail` không bao giờ được chứa password, cookie hay token. */
export function audit(db: Db, action: AuditAction, profileId: string | null, detail: Record<string, unknown> = {}): void {
  db.prepare('INSERT INTO audit_log (id, at, action, profile_id, detail) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    new Date().toISOString(),
    action,
    profileId,
    JSON.stringify(detail)
  )
}
