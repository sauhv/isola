import AdmZip from 'adm-zip'
import { generateKeyPairSync } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { extensionIdFromKey } from './crx'

export class ExtensionPackageError extends Error {}

const MAX_UNPACKED_BYTES = 200 * 1024 * 1024
const MAX_ENTRIES = 20_000
const MAX_ICON_BYTES = 300 * 1024

export interface ExtensionInfo {
  id: string
  name: string
  version: string
  description: string | null
  manifestVersion: number
  permissions: string[]
  icon: string | null
  /** Public key base64 (DER SPKI), đã ghi vào manifest.key. */
  publicKey: string
}

/**
 * Giải nén zip vào `dest`, chặn zip-slip (đường dẫn thoát khỏi thư mục) và zip bomb.
 * Zip có một thư mục bọc ngoài (myext/manifest.json) thì bóc lớp đó.
 */
export function extractZip(zip: Buffer, dest: string): void {
  let archive: AdmZip
  try {
    archive = new AdmZip(zip)
  } catch {
    throw new ExtensionPackageError('File zip hỏng')
  }
  const entries = archive.getEntries()
  if (entries.length > MAX_ENTRIES) throw new ExtensionPackageError('Zip có quá nhiều file')

  const names = entries.map((e) => e.entryName.replace(/\\/g, '/'))
  let strip = ''
  if (!names.includes('manifest.json')) {
    const tops = new Set(names.map((n) => n.split('/')[0]))
    const [top] = [...tops]
    if (tops.size === 1 && names.includes(`${top}/manifest.json`)) strip = `${top}/`
  }

  let total = 0
  mkdirSync(dest, { recursive: true })
  for (const entry of entries) {
    let name = entry.entryName.replace(/\\/g, '/')
    if (strip) {
      if (!name.startsWith(strip)) continue
      name = name.slice(strip.length)
    }
    if (!name || entry.isDirectory) continue
    if (isAbsolute(name) || /^[a-z]:/i.test(name)) throw new ExtensionPackageError('Zip chứa đường dẫn tuyệt đối')
    const target = normalize(join(dest, name))
    if (!target.startsWith(normalize(dest) + sep)) throw new ExtensionPackageError('Zip chứa đường dẫn thoát khỏi thư mục')
    const data = entry.getData()
    total += data.length
    if (total > MAX_UNPACKED_BYTES) throw new ExtensionPackageError('Extension giải nén quá 200 MB')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
  }
}

/** Chép thư mục extension đã giải nén (người dùng chọn) vào `dest`. */
export function copyFolder(src: string, dest: string): void {
  if (!existsSync(join(src, 'manifest.json'))) throw new ExtensionPackageError('Thư mục không có manifest.json')
  cpSync(src, dest, { recursive: true, dereference: false, filter: (s) => !statSync(s).isSymbolicLink() })
}

/**
 * Đọc và chuẩn hóa manifest trong `dir`:
 * - chỉ nhận Manifest V3 (Chrome ≥ 138 bỏ MV2);
 * - ghi `key` vào manifest để ID cố định qua mọi phiên bản (giữ dữ liệu extension trong profile);
 * - đọc tên/mô tả theo _locales, lấy icon và danh sách quyền để hiện trên UI.
 *
 * `publicKey`: khóa từ CRX hoặc khóa đã lưu của extension. Không có thì dùng `key` sẵn trong
 * manifest, hoặc sinh khóa mới (extension tự làm/zip không có key).
 */
export function finalizeManifest(dir: string, publicKey?: Buffer): ExtensionInfo {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) throw new ExtensionPackageError('Không có manifest.json')
  let manifest: Record<string, any>
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''))
  } catch {
    throw new ExtensionPackageError('manifest.json không đọc được')
  }
  const mv = Number(manifest.manifest_version)
  if (mv !== 3) {
    throw new ExtensionPackageError(
      mv === 2 ? 'Extension dùng Manifest V2, Chrome đã ngừng hỗ trợ. Cần bản Manifest V3.' : 'manifest_version không hợp lệ'
    )
  }
  if (typeof manifest.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    throw new ExtensionPackageError('version trong manifest không hợp lệ')
  }

  let keyDer: Buffer
  if (publicKey) {
    keyDer = publicKey
  } else if (typeof manifest.key === 'string') {
    keyDer = Buffer.from(manifest.key, 'base64')
  } else {
    keyDer = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' })
  }
  const keyB64 = keyDer.toString('base64')
  if (manifest.key !== keyB64) {
    manifest.key = keyB64
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }

  const messages = loadMessages(dir, manifest.default_locale)
  const resolve = (s: unknown): string | null => {
    if (typeof s !== 'string') return null
    const m = /^__MSG_(.+)__$/.exec(s)
    if (!m) return s
    return messages[m[1].toLowerCase()] ?? s
  }

  return {
    id: extensionIdFromKey(keyDer),
    name: (resolve(manifest.name) ?? 'Không tên').slice(0, 200),
    version: manifest.version,
    description: resolve(manifest.description)?.slice(0, 500) ?? null,
    manifestVersion: mv,
    permissions: [
      ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
      ...(Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [])
    ]
      .filter((p): p is string => typeof p === 'string')
      .slice(0, 100),
    icon: readIcon(dir, manifest.icons),
    publicKey: keyB64
  }
}

function loadMessages(dir: string, locale: unknown): Record<string, string> {
  const candidates = [typeof locale === 'string' ? locale : null, 'en', 'en_US'].filter(Boolean) as string[]
  for (const loc of candidates) {
    const file = join(dir, '_locales', loc, 'messages.json')
    if (!existsSync(file)) continue
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) as Record<string, { message?: string }>
      return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), String(v?.message ?? '')]))
    } catch {
      return {}
    }
  }
  return {}
}

function readIcon(dir: string, icons: unknown): string | null {
  if (!icons || typeof icons !== 'object') return null
  const entries = Object.entries(icons as Record<string, string>)
    .map(([size, path]) => [Number(size), path] as const)
    .filter(([size, path]) => Number.isFinite(size) && typeof path === 'string')
    .sort((a, b) => a[0] - b[0])
  const pick = [...entries].reverse().find(([s]) => s <= 128) ?? entries.at(-1)
  if (!pick) return null
  const file = normalize(join(dir, pick[1]))
  const rel = relative(dir, file)
  if (rel.startsWith('..') || isAbsolute(rel) || !existsSync(file)) return null
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[
    extname(file).toLowerCase()
  ]
  if (!mime) return null
  const data = readFileSync(file)
  if (data.length > MAX_ICON_BYTES) return null
  return `data:${mime};base64,${data.toString('base64')}`
}

/** Liệt kê thư mục con (dùng khi dọn bản cũ). */
export function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}
