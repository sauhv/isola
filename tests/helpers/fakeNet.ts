import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import http from 'node:http'
import net from 'node:net'
import { Server } from 'proxy-chain'
import type { SecretBox } from '../../src/main/services/secretBox'
import type { GeoLookup } from '../../src/main/services/geoService'

/** SecretBox AES-256-GCM với khóa ngẫu nhiên, thay safeStorage trong test. */
export function testSecretBox(): SecretBox {
  const key = randomBytes(32)
  return {
    encrypt(plain) {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
    },
    decrypt(encoded) {
      const buf = Buffer.from(encoded, 'base64')
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
      d.setAuthTag(buf.subarray(12, 28))
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
    }
  }
}

export const fakeGeo: GeoLookup = {
  lookup: (ip) => (ip === '203.0.113.7' ? { country: 'VN', city: 'Hanoi', timezone: 'Asia/Ho_Chi_Minh' } : null)
}

/** Server đích local: đếm số lần bị gọi trực tiếp (dùng để phát hiện rò rỉ ra ngoài proxy). */
export async function startTarget(): Promise<{ port: number; hits: () => number; close: () => Promise<void> }> {
  let hits = 0
  const server = http.createServer((_req, res) => {
    hits++
    res.end('direct-hit')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: (server.address() as net.AddressInfo).port,
    hits: () => hits,
    close: () => new Promise((r) => server.close(() => r()))
  }
}

/**
 * Upstream HTTP proxy giả có auth. Mọi request tới host `isola.test` được trả lời ngay tại proxy:
 *  /ip  → "203.0.113.7" (giả lập IP ra của proxy)
 *  còn lại → "via-upstream"
 * Không bao giờ tự đi ra mạng thật.
 */
export async function startHttpUpstream(user: string, pass: string) {
  const server = new Server({
    host: '127.0.0.1',
    port: 0,
    prepareRequestFunction: ({ username, password, hostname, isHttp, request }) => {
      if (username !== user || password !== pass) return { requestAuthentication: true }
      if (hostname !== 'isola.test' || !isHttp) return { failMsg: 'blocked in test' }
      const path = new URL(request.url ?? '/', 'http://isola.test').pathname
      return {
        customResponseFunction: () => ({
          statusCode: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: path === '/ip' ? '203.0.113.7' : '<html><body>via-upstream</body></html>'
        })
      }
    }
  })
  server.on('requestFailed', () => {})
  await server.listen()
  return { port: server.port, close: () => server.close(true) }
}

/**
 * SOCKS5 server tối giản có auth user/pass (RFC 1928 + 1929).
 * CONNECT tới isola.test:80 được nối sang `targetPort` local; đích khác bị từ chối.
 */
export async function startSocksUpstream(user: string, pass: string, targetPort: number) {
  const server = net.createServer((sock) => {
    sock.on('error', () => {})
    sock.once('data', (greet) => {
      if (greet[0] !== 5) return sock.destroy()
      sock.write(Buffer.from([5, 2])) // yêu cầu auth user/pass
      sock.once('data', (auth) => {
        const ulen = auth[1]
        const u = auth.subarray(2, 2 + ulen).toString()
        const plen = auth[2 + ulen]
        const p = auth.subarray(3 + ulen, 3 + ulen + plen).toString()
        if (u !== user || p !== pass) {
          sock.end(Buffer.from([1, 1]))
          return
        }
        sock.write(Buffer.from([1, 0]))
        sock.once('data', (req) => {
          // VER CMD RSV ATYP ...
          let host = ''
          let off = 4
          if (req[3] === 3) {
            const len = req[4]
            host = req.subarray(5, 5 + len).toString()
            off = 5 + len
          } else if (req[3] === 1) {
            host = [...req.subarray(4, 8)].join('.')
            off = 8
          }
          const port = req.readUInt16BE(off)
          if (host !== 'isola.test' || port !== 80) {
            sock.end(Buffer.from([5, 2, 0, 1, 0, 0, 0, 0, 0, 0]))
            return
          }
          const out = net.connect(targetPort, '127.0.0.1', () => {
            sock.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
            sock.pipe(out).pipe(sock)
          })
          out.on('error', () => sock.destroy())
        })
      })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    port: (server.address() as net.AddressInfo).port,
    close: () => new Promise<void>((r) => server.close(() => r()))
  }
}

/** Lấy một cổng chắc chắn không có ai nghe (để giả lập upstream chết). */
export async function deadPort(): Promise<number> {
  const s = net.createServer()
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  const port = (s.address() as net.AddressInfo).port
  await new Promise<void>((r) => s.close(() => r()))
  return port
}
