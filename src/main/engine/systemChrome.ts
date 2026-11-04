import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface SystemChrome {
  path: string
  version: string
  major: number
}

/** Các vị trí cài Google Chrome chính thức trên Windows. */
function candidates(): string[] {
  const envs = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']]
  return envs
    .filter(Boolean)
    .map((base) => join(base as string, 'Google', 'Chrome', 'Application', 'chrome.exe'))
}

/** Lấy version từ thư mục con dạng 142.0.7444.135 trong .../Application. Chọn bản cao nhất. */
function versionFromAppDir(exe: string): string | null {
  const appDir = dirname(exe)
  if (!existsSync(appDir)) return null
  const versions = readdirSync(appDir)
    .filter((n) => /^\d+\.\d+\.\d+\.\d+$/.test(n))
    .sort((a, b) => cmpVersion(b, a))
  return versions[0] ?? null
}

function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 4; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Phát hiện Google Chrome chính thức cài trên máy. null nếu không có. Chỉ Windows. */
export function detectSystemChrome(): SystemChrome | null {
  if (process.platform !== 'win32') return null
  for (const path of candidates()) {
    if (!existsSync(path)) continue
    const version = versionFromAppDir(path)
    if (!version) continue
    const major = Number(version.split('.')[0])
    if (!Number.isInteger(major) || major < 1) continue
    return { path, version, major }
  }
  return null
}
