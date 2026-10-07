import http from 'node:http'
import https from 'node:https'
import type { Socket } from 'node:net'
import tls from 'node:tls'

export interface ProxyResponse {
  status: number
  body: string
}

const MAX_BODY = 64 * 1024

/**
 * GET một URL qua HTTP proxy tại 127.0.0.1:{proxyPort}, đi cùng đường với trình duyệt.
 * http:// gửi absolute-URI; https:// mở tunnel CONNECT rồi TLS bên trong.
 */
export function getViaProxy(proxyPort: number, url: string, timeoutMs: number): Promise<ProxyResponse> {
  const target = new URL(url)
  return new Promise<ProxyResponse>((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error(`Hết thời gian chờ (${timeoutMs / 1000}s)`)), timeoutMs)
    const cleanups: (() => void)[] = []
    let done = false
    function fail(err: Error) {
      if (done) return
      done = true
      clearTimeout(timer)
      cleanups.forEach((c) => c())
      reject(err)
    }
    function ok(r: ProxyResponse) {
      if (done) return
      done = true
      clearTimeout(timer)
      cleanups.forEach((c) => c())
      resolve(r)
    }
    function readBody(res: http.IncomingMessage) {
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) return fail(new Error('Phản hồi quá lớn'))
        chunks.push(c)
      })
      res.on('end', () => ok({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', fail)
    }

    if (target.protocol === 'http:') {
      const req = http.request({
        host: '127.0.0.1',
        port: proxyPort,
        method: 'GET',
        path: target.href,
        headers: { Host: target.host, Connection: 'close' }
      })
      cleanups.push(() => req.destroy())
      req.on('response', readBody)
      req.on('error', fail)
      req.end()
      return
    }

    if (target.protocol !== 'https:') return fail(new Error(`Không hỗ trợ ${target.protocol}`))
    const port = Number(target.port || 443)
    const connect = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `${target.hostname}:${port}`,
      headers: { Host: `${target.hostname}:${port}` }
    })
    cleanups.push(() => connect.destroy())
    connect.on('error', fail)
    connect.on('connect', (res, socket: Socket) => {
      cleanups.push(() => socket.destroy())
      if (res.statusCode !== 200) return fail(new Error(`CONNECT bị từ chối (HTTP ${res.statusCode})`))
      const req = https.request({
        method: 'GET',
        host: target.hostname,
        path: target.pathname + target.search,
        headers: { Host: target.host, Connection: 'close' },
        createConnection: () => tls.connect({ socket, servername: target.hostname })
      })
      cleanups.push(() => req.destroy())
      req.on('response', readBody)
      req.on('error', fail)
      req.end()
    })
    connect.end()
  })
}
