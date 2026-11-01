import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '../src/main/db'
import { ExtensionService } from '../src/main/services/extensionService'

let root: string
let db: Db
let ext: ExtensionService

const ID = 'abcdefghijklmnopabcdefghijklmnop'

function dbInsert(dir: string) {
  db.prepare(
    `INSERT INTO extensions (id, name, version, description, source, public_key, dir, permissions, icon, created_at, updated_at)
     VALUES (?, 'E', '1.0', null, 'file', 'k', ?, '[]', null, 't', 't')
     ON CONFLICT(id) DO UPDATE SET dir = excluded.dir`
  ).run(ID, dir)
}
function makeDir(rel: string) {
  mkdirSync(join(root, 'extensions', rel), { recursive: true })
  writeFileSync(join(root, 'extensions', rel, 'manifest.json'), '{"manifest_version":3,"name":"E","version":"1.0"}')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'isola-rec-'))
  db = openDatabase(join(root, 'isola.db'))
  ext = new ExtensionService(db, join(root, 'extensions'), { prodVersion: '155.0.0.0' })
})
afterEach(() => {
  db.close()
  rmSync(root, { recursive: true, force: true })
})

describe('ExtensionService.reconcile', () => {
  it('dir trong DB lệch đĩa: cập nhật về thư mục còn manifest', () => {
    dbInsert(`${ID}/1.0-aaaaaa`) // DB trỏ dir không tồn tại
    makeDir(`${ID}/1.0-bbbbbb`) // thực tế trên đĩa là suffix khác
    ext.reconcile()
    const row = db.prepare('SELECT dir FROM extensions WHERE id = ?').get(ID) as { dir: string }
    expect(row.dir).toBe(`${ID}/1.0-bbbbbb`)
  })

  it('không còn file nào: gỡ record (và phạm vi gán)', () => {
    dbInsert(`${ID}/1.0-aaaaaa`)
    db.prepare("INSERT INTO extension_targets (extension_id, kind, target_id) VALUES (?, 'profile', 'p1')").run(ID)
    ext.reconcile()
    expect(db.prepare('SELECT COUNT(*) c FROM extensions WHERE id = ?').get(ID)).toMatchObject({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM extension_targets WHERE extension_id = ?').get(ID)).toMatchObject({ c: 0 })
  })

  it('dir khớp sẵn: không đổi', () => {
    dbInsert(`${ID}/1.0-cccccc`)
    makeDir(`${ID}/1.0-cccccc`)
    ext.reconcile()
    const row = db.prepare('SELECT dir FROM extensions WHERE id = ?').get(ID) as { dir: string }
    expect(row.dir).toBe(`${ID}/1.0-cccccc`)
  })
})
