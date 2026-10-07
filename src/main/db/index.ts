import Database from 'better-sqlite3'

export type Db = Database.Database

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

export function openDatabase(file: string): Db {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}
