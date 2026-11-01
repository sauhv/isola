/**
 * Đọc CSV (RFC4180: dấu phẩy phân cột, "..." cho ô có phẩy/xuống dòng, "" là dấu nháy escape).
 * Trả về mảng bản ghi theo header (chữ thường, đã trim). Dòng trống bị bỏ qua.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = tokenize(text.replace(/^﻿/, '')) // bỏ BOM nếu có
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const out: Record<string, string>[] = []
  for (const r of rows.slice(1)) {
    if (r.every((c) => c.trim() === '')) continue
    const rec: Record<string, string> = {}
    header.forEach((h, i) => {
      if (h) rec[h] = (r[i] ?? '').trim()
    })
    out.push(rec)
  }
  return out
}

function tokenize(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  // ô/dòng cuối nếu còn dở
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Tách ô nhiều giá trị (tags, URL) bằng ; hoặc | hoặc xuống dòng. */
export function splitMulti(cell: string): string[] {
  return cell
    .split(/[;|\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Đọc ô boolean: true/1/yes/x/có → true. */
export function parseBool(cell: string): boolean {
  return /^(1|true|yes|y|x|có|co)$/i.test(cell.trim())
}
