import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export type Db = Database.Database

const BACKUP_KEEP = 5

/** Kiểm nhanh DB có hỏng không (mở readonly). true = ổn. */
export function isHealthy(file: string): boolean {
  if (!existsSync(file)) return true // chưa có file → DB mới, coi là ổn
  let db: Db | undefined
  try {
    db = new Database(file, { readonly: true })
    return (db.pragma('quick_check', { simple: true }) as string) === 'ok'
  } catch {
    return false
  } finally {
    db?.close()
  }
}

/** Trước khi mở: nếu DB hỏng, đổi tên ra .corrupt và khôi phục từ bản sao lưu mới nhất (nếu có). */
function recoverIfCorrupt(file: string, backupDir: string): void {
  if (isHealthy(file)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(file + suffix)) {
      try {
        renameSync(file + suffix, `${file}.corrupt-${stamp}${suffix}`)
      } catch {
        /* bỏ qua */
      }
    }
  }
  const backups = listBackups(backupDir)
  for (const b of backups) {
    // chọn bản sao lưu lành mới nhất
    if (isHealthy(b)) {
      copyFileSync(b, file)
      console.error(`[db] DB hỏng, đã khôi phục từ sao lưu: ${b}`)
      return
    }
  }
  console.error('[db] DB hỏng và không có sao lưu lành; tạo DB mới.')
}

function listBackups(backupDir: string): string[] {
  if (!existsSync(backupDir)) return []
  return readdirSync(backupDir)
    .filter((n) => /^isola-.*\.db$/.test(n))
    .sort()
    .reverse() // mới nhất trước (tên có timestamp)
    .map((n) => join(backupDir, n))
}

/** Sau khi mở & DB lành: chụp một bản sao lưu, giữ lại BACKUP_KEEP bản gần nhất. */
function snapshot(db: Db, file: string, backupDir: string): void {
  try {
    mkdirSync(backupDir, { recursive: true })
    db.pragma('wal_checkpoint(TRUNCATE)')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(file, join(backupDir, `isola-${stamp}.db`))
    const extra = listBackups(backupDir).slice(BACKUP_KEEP)
    for (const old of extra) rmSync(old, { force: true })
  } catch (err) {
    console.error('[db] sao lưu lỗi:', (err as Error).message)
  }
}

type Migration = { version: number; name: string; sql: string }

// Vite nhúng nội dung file .sql vào bundle lúc build, nên bản đóng gói không cần copy thư mục migrations.
const migrationFiles = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

export function loadMigrations(): Migration[] {
  return Object.entries(migrationFiles)
    .map(([path, sql]) => {
      const name = path.split('/').pop()!
      const match = /^(\d+)_.+\.sql$/.exec(name)
      if (!match) throw new Error(`Tên migration sai định dạng: ${name}`)
      return { version: Number(match[1]), name, sql }
    })
    .sort((a, b) => a.version - b.version)
}

/**
 * Chạy các migration chưa áp. Phiên bản lưu ở PRAGMA user_version.
 * Mỗi migration chạy trong một transaction, nên kill giữa chừng thì rollback sạch.
 */
export function migrate(db: Db, migrations: Migration[] = loadMigrations()): number {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const m of migrations) {
    if (m.version <= current) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })()
  }
  return db.pragma('user_version', { simple: true }) as number
}

export function openDatabase(file: string, opts: { backupDir?: string } = {}): Db {
  // Hỏng DB thì khôi phục từ sao lưu trước khi mở (tự lành).
  if (opts.backupDir) recoverIfCorrupt(file, opts.backupDir)
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  // FULL: an toàn hơn khi mất điện / bị kill đột ngột (đổi lại chậm hơn chút) — dữ liệu profile quan trọng.
  db.pragma('synchronous = FULL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  // Chụp sao lưu sau khi mở lành, để lần sau có cái mà khôi phục.
  if (opts.backupDir) snapshot(db, file, opts.backupDir)
  return db
}
