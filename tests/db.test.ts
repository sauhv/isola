import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSetting, isHealthy, loadMigrations, migrate, openDatabase, setSetting } from '../src/main/db'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'

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
    // Bảng của SPEC-003 phải có; migration sau được thêm bảng mới.
    expect(tables).toEqual(expect.arrayContaining([
      'audit_log',
      'cookies_import',
      'fingerprints',
      'groups',
      'profile_tags',
      'profiles',
      'proxies',
      'settings',
      'tags'
    ]))
    db.close()
  })

  it('migration 006: giữ dữ liệu cũ và cho phép đặt trùng tên profile sau nâng cấp', () => {
    const Database = require('better-sqlite3')
    const db = new Database(join(dir, 'isola.db'))
    db.pragma('journal_mode = WAL')
    // Như openDatabase: tắt FK trong lúc migrate để 006 dựng lại bảng được.
    db.pragma('foreign_keys = OFF')
    const all = loadMigrations()
    migrate(db, all.filter((m) => m.version <= 5)) // schema cũ (name UNIQUE)
    db.prepare("INSERT INTO fingerprints (id, seed_json, catalog_id, created_at) VALUES ('f1','{}','cat','t')").run()
    const insProfile = (id: string, serial: number, name: string) =>
      db
        .prepare(
          "INSERT INTO profiles (id, serial, name, kernel, fingerprint_id, start_urls, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
        )
        .run(id, serial, name, 'cft-155', 'f1', '[]', 't', 't')
    insProfile('p1', 1, 'Dup')
    // schema cũ: trùng tên bị chặn
    expect(() => insProfile('p2', 2, 'Dup')).toThrow()

    migrate(db, all) // nâng cấp lên 006

    // dữ liệu cũ còn nguyên
    expect(db.prepare("SELECT name FROM profiles WHERE id='p1'").get()).toMatchObject({ name: 'Dup' })
    // giờ cho phép trùng tên
    insProfile('p2', 2, 'Dup')
    expect(db.prepare("SELECT COUNT(*) AS n FROM profiles WHERE name='Dup'").get()).toMatchObject({ n: 2 })
    // index được tạo lại
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='profiles'").all().map((r: any) => r.name)
    expect(idx).toEqual(expect.arrayContaining(['idx_profiles_proxy', 'idx_profiles_group']))
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

  it('getSetting/setSetting: ghi đọc theo key, ghi đè', () => {
    const db = openDatabase(join(dir, 'isola.db'))
    expect(getSetting(db, 'labelWindows')).toBeNull()
    setSetting(db, 'labelWindows', '1')
    expect(getSetting(db, 'labelWindows')).toBe('1')
    setSetting(db, 'labelWindows', '0')
    expect(getSetting(db, 'labelWindows')).toBe('0')
    db.close()
  })

  it('tự sao lưu khi mở, và tự khôi phục khi DB hỏng', () => {
    const file = join(dir, 'isola.db')
    const backupDir = join(dir, 'backups')

    // mở lần đầu: tạo bản ghi + sao lưu
    let db = openDatabase(file, { backupDir })
    db.pragma(`user_version = ${LATEST}`)
    db.exec("CREATE TABLE IF NOT EXISTS t (x TEXT)")
    db.prepare('INSERT INTO t (x) VALUES (?)').run('giữ-nguyên')
    db.close()
    // mở lại để chụp sao lưu có dữ liệu
    db = openDatabase(file, { backupDir })
    db.close()
    expect(readdirSync(backupDir).some((n) => /^isola-.*\.db$/.test(n))).toBe(true)

    // làm hỏng file DB
    writeFileSync(file, Buffer.from('không-phải-sqlite-đây-là-rác'))
    rmSync(file + '-wal', { force: true })
    rmSync(file + '-shm', { force: true })
    expect(isHealthy(file)).toBe(false)

    // mở lại với backupDir → tự khôi phục từ sao lưu
    db = openDatabase(file, { backupDir })
    expect(isHealthy(file)).toBe(true)
    const row = db.prepare("SELECT x FROM t").get() as { x: string } | undefined
    expect(row?.x).toBe('giữ-nguyên')
    // file hỏng được giữ lại dạng .corrupt-*
    expect(readdirSync(dir).some((n) => n.includes('.corrupt-'))).toBe(true)
    db.close()
  })
})
