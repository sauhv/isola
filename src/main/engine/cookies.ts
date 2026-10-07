/** Cookie theo định dạng CDP Network.CookieParam. */
export interface CookieParam {
  name: string
  value: string
  url?: string
  domain?: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  expires?: number
}

export class CookieParseError extends Error {}

const MAX_COOKIES = 5000
const MAX_VALUE = 8192

function sameSiteOf(v: unknown): CookieParam['sameSite'] {
  const s = String(v ?? '').toLowerCase()
  if (s === 'strict') return 'Strict'
  if (s === 'lax') return 'Lax'
  if (s === 'none' || s === 'no_restriction') return 'None'
  return undefined
}

function finish(c: {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite?: CookieParam['sameSite']
  expires?: number
}): CookieParam {
  if (!c.name || c.name.length > 256) throw new CookieParseError('Cookie thiếu tên hoặc tên quá dài')
  if (c.value.length > MAX_VALUE) throw new CookieParseError(`Cookie "${c.name}" quá dài`)
  const domain = c.domain.trim().toLowerCase()
  if (!/^\.?[a-z0-9.-]+$/.test(domain)) throw new CookieParseError(`Cookie "${c.name}" có domain không hợp lệ`)
  const path = c.path?.startsWith('/') ? c.path : '/'
  // SameSite=None bắt buộc Secure; Chrome sẽ từ chối nếu thiếu.
  const secure = c.secure || c.sameSite === 'None'
  const out: CookieParam = { name: c.name, value: c.value, path, secure, httpOnly: c.httpOnly }
  if (c.sameSite) out.sameSite = c.sameSite
  if (c.expires && c.expires > 0) out.expires = Math.floor(c.expires)
  // Cookie host-only đặt bằng url; cookie domain đặt bằng domain (Chrome tự thêm dấu chấm).
  if (c.hostOnly && !domain.startsWith('.')) out.url = `http${secure ? 's' : ''}://${domain}${path}`
  else out.domain = domain
  return out
}

/**
 * Đọc cookie người dùng dán vào:
 * - JSON mảng (EditThisCookie, Cookie-Editor) hoặc { cookies: [...] }
 * - Netscape cookies.txt (tab-separated, hỗ trợ dòng #HttpOnly_)
 */
export function parseCookies(text: string): CookieParam[] {
  const t = text.trim()
  if (!t) return []
  let out: CookieParam[]
  if (t.startsWith('[') || t.startsWith('{')) {
    let data: unknown
    try {
      data = JSON.parse(t)
    } catch {
      throw new CookieParseError('JSON cookie không đọc được')
    }
    const list = Array.isArray(data) ? data : (data as { cookies?: unknown })?.cookies
    if (!Array.isArray(list)) throw new CookieParseError('JSON phải là mảng cookie')
    out = list.map((raw, i) => {
      const c = raw as Record<string, unknown>
      if (!c || typeof c !== 'object') throw new CookieParseError(`Cookie thứ ${i + 1} không hợp lệ`)
      const domain = String(c.domain ?? '')
      return finish({
        name: String(c.name ?? ''),
        value: String(c.value ?? ''),
        domain,
        hostOnly: c.hostOnly === true || (c.hostOnly === undefined && !domain.startsWith('.')),
        path: String(c.path ?? '/'),
        secure: c.secure === true,
        httpOnly: c.httpOnly === true,
        sameSite: sameSiteOf(c.sameSite),
        expires: c.session === true ? undefined : Number(c.expirationDate ?? c.expires ?? 0) || undefined
      })
    })
  } else {
    out = []
    for (const [i, line] of t.split(/\r?\n/).entries()) {
      let l = line.trim()
      if (!l) continue
      let httpOnly = false
      if (l.startsWith('#HttpOnly_')) {
        httpOnly = true
        l = l.slice('#HttpOnly_'.length)
      } else if (l.startsWith('#')) continue
      const f = l.split('\t')
      if (f.length < 7) throw new CookieParseError(`Dòng ${i + 1}: cookies.txt cần 7 cột cách nhau bằng tab`)
      const [domain, includeSub, path, secure, expires, name, ...rest] = f
      out.push(
        finish({
          name,
          value: rest.join('\t'),
          domain,
          hostOnly: includeSub.toUpperCase() !== 'TRUE',
          path,
          secure: secure.toUpperCase() === 'TRUE',
          httpOnly,
          expires: Number(expires) || undefined
        })
      )
    }
  }
  if (out.length > MAX_COOKIES) throw new CookieParseError(`Tối đa ${MAX_COOKIES} cookie`)
  return out
}
