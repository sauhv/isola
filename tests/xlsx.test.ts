import AdmZip from 'adm-zip'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseXlsx } from '../src/main/engine/xlsx'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function colLetter(i: number): string {
  let s = ''
  i += 1
  while (i > 0) {
    const m = (i - 1) % 26
    s = String.fromCharCode(65 + m) + s
    i = Math.floor((i - m - 1) / 26)
  }
  return s
}

/** Dựng .xlsx tối giản (shared strings) để test/sinh mẫu — giống file Excel xuất ra. */
function buildXlsx(rows: string[][]): Buffer {
  const strings: string[] = []
  const idx = new Map<string, number>()
  const sid = (s: string) => {
    if (!idx.has(s)) {
      idx.set(s, strings.length)
      strings.push(s)
    }
    return idx.get(s)!
  }
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => (v === '' ? '' : `<c r="${colLetter(ci)}${ri + 1}" t="s"><v>${sid(v)}</v></c>`))
        .join('')
      return `<row r="${ri + 1}">${cells}</row>`
    })
    .join('')
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`
  const zip = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'))
  zip.addFile('_rels/.rels', Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'))
  zip.addFile('xl/workbook.xml', Buffer.from('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'))
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'))
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheet))
  zip.addFile('xl/sharedStrings.xml', Buffer.from(sst))
  return zip.toBuffer()
}

describe('parseXlsx', () => {
  it('đọc header + dòng, ô chuỗi shared, ký tự đặc biệt', () => {
    const buf = buildXlsx([
      ['name', 'group', 'tags'],
      ['Acc 1', 'Shop', 'fb;vip'],
      ['A & B', '', 'x']
    ])
    expect(parseXlsx(buf)).toEqual([
      { name: 'Acc 1', group: 'Shop', tags: 'fb;vip' },
      { name: 'A & B', group: '', tags: 'x' }
    ])
  })

  it('sinh file mẫu samples/profile-import-mau.xlsx', () => {
    const buf = buildXlsx([
      ['name', 'group', 'tags', 'platform', 'username', 'notes', 'proxy', 'starturls', 'lab'],
      ['Facebook - XLSX 1', 'Marketing', 'facebook;mẫu', 'facebook', 'user_fb_01', 'Tài khoản mẫu', '', 'https://www.facebook.com/', 'true'],
      ['TikTok - XLSX 2', 'Marketing', 'tiktok', 'tiktok', 'user_tt_02', '', '', 'https://www.tiktok.com/', 'true'],
      ['Shopee - XLSX 3', '', 'shopee;bán hàng', 'shopee', '', 'Không proxy (lab)', '', '', 'true'],
      ['Có proxy - XLSX 4', 'Sales', 'proxy;demo', '', '', 'Proxy SOCKS5 mẫu', 'socks5://user:pass@1.2.3.4:1080', '', 'false']
    ])
    mkdirSync(join(process.cwd(), 'samples'), { recursive: true })
    writeFileSync(join(process.cwd(), 'samples', 'profile-import-mau.xlsx'), buf)
    expect(parseXlsx(buf)).toHaveLength(4)
  })
})
