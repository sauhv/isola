import { EventEmitter } from 'node:events'
import type { Readable, Writable } from 'node:stream'

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; method: string }

/**
 * Kết nối Chrome DevTools Protocol qua `--remote-debugging-pipe`.
 * Chrome đọc lệnh từ fd 3 và ghi phản hồi ra fd 4, mỗi message JSON kết thúc bằng byte 0.
 * Không mở cổng TCP nên trang web trong profile không dò hay chiếm được kết nối điều khiển.
 */
export class CdpPipe extends EventEmitter {
  private nextId = 1
  private pending = new Map<number, Pending>()
  private chunks: Buffer[] = []
  private closed = false

  constructor(
    private readonly out: Writable,
    input: Readable
  ) {
    super()
    input.on('data', (chunk: Buffer) => this.onData(chunk))
    input.on('close', () => this.dispose())
    input.on('error', () => this.dispose())
    out.on('error', () => this.dispose())
  }

  get isClosed(): boolean {
    return this.closed
  }

  send<T = any>(method: string, params: object = {}, sessionId?: string, timeoutMs = 15_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error(`CDP đã đóng (${method})`))
    const id = this.nextId++
    const msg = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        method,
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      })
      this.out.write(msg + '\0')
    })
  }

  private onData(chunk: Buffer): void {
    let start = 0
    let end = chunk.indexOf(0)
    while (end !== -1) {
      this.chunks.push(chunk.subarray(start, end))
      const raw = Buffer.concat(this.chunks).toString('utf8')
      this.chunks = []
      this.dispatch(raw)
      start = end + 1
      end = chunk.indexOf(0, start)
    }
    if (start < chunk.length) this.chunks.push(chunk.subarray(start))
  }

  private dispatch(raw: string): void {
    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`))
      else p.resolve(msg.result)
    } else if (msg.method) {
      this.emit('event', msg.method, msg.params, msg.sessionId)
    }
  }

  private dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const p of this.pending.values()) p.reject(new Error(`CDP đã đóng (${p.method})`))
    this.pending.clear()
    this.emit('close')
  }
}
