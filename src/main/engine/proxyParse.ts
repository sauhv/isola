import type { ProxyInput, ProxyType } from '../../shared/types'

const SCHEMES: Record<string, ProxyType> = {
  http: 'http',
  https: 'https',
  socks: 'socks5',
  socks5: 'socks5',
  socks5h: 'socks5'
}

const HOST_RE = /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?|\d{1,3}(?:\.\d{1,3}){3})$/i

export class ProxyParseError extends Error {}

function hostPort(host: string, portText: string): { host: string; port: number } {
  const h = host.trim()
  if (!HOST_RE.test(h)) throw new ProxyParseError('host không hợp lệ')
  if (!/^\d{1,5}$/.test(portText.trim())) throw new ProxyParseError('port không hợp lệ')
  const port = Number(portText)
  if (port < 1 || port > 65535) throw new ProxyParseError('port ngoài khoảng 1–65535')
  return { host: h, port }
}

/**
 * Đọc một dòng proxy. Nhận các dạng:
 *   scheme://user:pass@host:port   (scheme: http, https, socks, socks5, socks5h)
 *   user:pass@host:port
 *   host:port:user:pass            (pass có thể chứa dấu ':')
 *   host:port
 * Thông báo lỗi không bao giờ chứa nội dung dòng, để password không lọt ra UI hay log.
 */
export function parseProxyLine(line: string, defaultType: ProxyType): ProxyInput {
  const text = line.trim()
  if (!text) throw new ProxyParseError('dòng trống')

  const schemeMatch = /^([a-z0-9]+):\/\//i.exec(text)
  if (schemeMatch || text.includes('@')) {
    let type = defaultType
    let rest = text
    if (schemeMatch) {
      const t = SCHEMES[schemeMatch[1].toLowerCase()]
      if (!t) throw new ProxyParseError(`không hỗ trợ giao thức ${schemeMatch[1]}`)
      type = t
      rest = text.slice(schemeMatch[0].length)
    }
    rest = rest.replace(/\/+$/, '')
    const at = rest.lastIndexOf('@')
    const auth = at >= 0 ? rest.slice(0, at) : ''
    const addr = at >= 0 ? rest.slice(at + 1) : rest
    const colon = addr.lastIndexOf(':')
    if (colon < 0) throw new ProxyParseError('thiếu port')
    const { host, port } = hostPort(addr.slice(0, colon), addr.slice(colon + 1))
    let username: string | null = null
    let password: string | null = null
    if (auth) {
      const sep = auth.indexOf(':')
      try {
        username = decodeURIComponent(sep >= 0 ? auth.slice(0, sep) : auth)
        password = sep >= 0 ? decodeURIComponent(auth.slice(sep + 1)) : null
      } catch {
        throw new ProxyParseError('user/pass mã hóa URL sai')
      }
      if (!username) throw new ProxyParseError('thiếu username')
    }
    return { type, host, port, username, password, label: `${host}:${port}` }
  }

  const parts = text.split(':')
  if (parts.length === 2) {
    const { host, port } = hostPort(parts[0], parts[1])
    return { type: defaultType, host, port, label: `${host}:${port}` }
  }
  if (parts.length >= 4) {
    const { host, port } = hostPort(parts[0], parts[1])
    const username = parts[2]
    const password = parts.slice(3).join(':')
    if (!username) throw new ProxyParseError('thiếu username')
    return { type: defaultType, host, port, username, password, label: `${host}:${port}` }
  }
  throw new ProxyParseError('sai định dạng')
}

/** URL upstream cho proxy-chain. SOCKS5 dùng socks5h để tên miền được phân giải phía proxy, không rò DNS. */
export function upstreamUrl(p: {
  type: ProxyType
  host: string
  port: number
  username: string | null
  password: string | null
}): string {
  const scheme = p.type === 'socks5' ? 'socks5h' : p.type
  const auth = p.username
    ? `${encodeURIComponent(p.username)}${p.password !== null ? `:${encodeURIComponent(p.password)}` : ''}@`
    : ''
  return `${scheme}://${auth}${p.host}:${p.port}`
}
