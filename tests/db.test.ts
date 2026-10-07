import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMigrations, migrate, openDatabase } from '../src/main/db'

const require = createRequire(import.meta.url)
const LATEST = loadMigrations().at(-1)!.version

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'isola-db-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('db', () => {
  it('mở DB với WAL, foreign_keys, đủ bảng và chạy hết migration', () => {
    const db = openDatabase(join(dir, 'isola.db'))
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)
    expect(tables).toEqual([
      'audit_log',
      'cookies_import',
      'fingerprints',
      'groups',
      'profile_tags',
      'profiles',
      'proxies',
      'settings',
      'tags'
    ])
    db.close()
  })

  it('chạy migration lần hai không lỗi và không đổi version', () => {
    const file = join(dir, 'isola.db')
    openDatabase(file).close()
    const db = openDatabase(file)
    expect(migrate(db)).toBe(LATEST)
    db.close()
  })

  it('migration lỗi giữa chừng thì rollback, không để lại bảng dở', () => {
    const db = openDatabase(join(dir, 'isola.db'))
    const broken = [
      ...loadMigrations(),
      { version: LATEST + 1, name: '999_broken.sql', sql: 'CREATE TABLE half_done (id TEXT); SELECT * FROM missing_table;' }
    ]
    expect(() => migrate(db, broken)).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST)
    const half = db.prepare("SELECT name FROM sqlite_master WHERE name='half_done'").get()
    expect(half).toBeUndefined()
    db.close()
  })

  it('kill cứng process đang ghi không làm hỏng DB', async () => {
    const file = join(dir, 'isola.db')
    openDatabase(file).close()

    // Process con ghi liên tục rồi bị SIGKILL giữa lúc đang ghi.
    const writer = `
      const Database = require(${JSON.stringify(require.resolve('better-sqlite3'))});
      const db = new Database(${JSON.stringify(file)});
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      const ins = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      let i = 0;
      const batch = db.transaction(() => { for (let j = 0; j < 200; j++) ins.run('k' + (i++), 'x'.repeat(500)); });
      batch();
      process.stdout.write('ready\\n');
      for (;;) batch();
    `
    const child = spawn(process.execPath, ['-e', writer], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'inherit']
    })
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (b) => b.toString().includes('ready') && resolve())
      child.on('exit', (code) => reject(new Error(`writer thoát sớm, code ${code}`)))
    })
    await new Promise((r) => setTimeout(r, 300))
    const exited = new Promise((r) => child.once('exit', r))
    child.kill('SIGKILL')
    await exited

    const db = openDatabase(file)
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }
    expect(n).toBeGreaterThanOrEqual(200)
    // Transaction 200 dòng là nguyên tử: không bao giờ còn lô dở.
    expect(n % 200).toBe(0)
    db.close()
  })
})
