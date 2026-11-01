import AdmZip from 'adm-zip'
import { rowsToRecords } from './csv'

/**
 * Đọc .xlsx (OOXML: zip chứa XML) không cần thư viện nặng — chỉ cần adm-zip.
 * Lấy sheet đầu tiên, giải shared strings, trả về bản ghi theo header như CSV.
 * Hỗ trợ ô chuỗi (shared/inline) và số; không xử lý ngày (import profile chỉ dùng text).
 */
export function parseXlsx(buf: Buffer): Record<string, string>[] {
  const zip = new AdmZip(buf)
  const read = (name: string) => zip.getEntry(name)?.getData().toString('utf8') ?? ''

  const shared = parseSharedStrings(read('xl/sharedStrings.xml'))
  const sheetPath = firstSheetPath(zip, read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels'))
  const sheetXml = read(sheetPath)
  if (!sheetXml) return []
  return rowsToRecords(parseSheet(sheetXml, shared))
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** <si> có thể gồm nhiều <t> (rich text) → nối lại. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]))
    out.push(texts.join(''))
  }
  return out
}

function firstSheetPath(zip: AdmZip, workbook: string, rels: string): string {
  // Ưu tiên theo quan hệ r:id; nếu không có thì mặc định sheet1.
  const rid = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
  if (rid) {
    const target = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    if (target) {
      const clean = target.replace(/^\/?xl\//, '').replace(/^\//, '')
      if (zip.getEntry(`xl/${clean}`)) return `xl/${clean}`
    }
  }
  return 'xl/worksheets/sheet1.xml'
}

function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  for (const rowXml of xml.match(/<row[\s\S]*?<\/row>|<row[^>]*\/>/g) ?? []) {
    const cells: string[] = []
    for (const c of rowXml.matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const inner = c[2] ?? ''
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? ''
      const type = /t="([^"]+)"/.exec(attrs)?.[1]
      let val = ''
      if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '-1')
        val = shared[idx] ?? ''
      } else if (type === 'inlineStr') {
        val = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('')
      } else {
        val = decode(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
      }
      if (ref) cells[colIndex(ref)] = val
      else cells.push(val)
    }
    rows.push([...cells].map((v) => v ?? ''))
  }
  return rows
}
