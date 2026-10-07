import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdirSync } from 'node:fs'
import type { Readable, Writable } from 'node:stream'
import type { ProfileStatusEvent } from '../../shared/types'
import type { Db } from '../db'
import { CdpPipe } from '../engine/cdpPipe'
import { Relay } from '../engine/relay'
import { IsolaError } from '../errors'
import { paths } from '../paths'
import { audit } from './audit'
import type { KernelService } from './kernelService'
import type { ProfileService } from './profileService'
import type { ProxyService } from './proxyService'

const STOP_GRACE_MS = 5_000

type Running = {
  proc: ChildProcess
  pid: number
  cdp: CdpPipe
  relay: Relay | null
  exited: Promise<void>
}

export interface LaunchOptions {
  /** Cờ thêm cho mọi lần spawn. Chỉ test dùng (ví dụ `--headless=new`). */
  extraArgs?: string[]
}

/**
 * Mỗi profile một process Chrome với user-data-dir riêng, điều khiển qua CDP pipe.
 * Events: 'status' (ProfileStatusEvent).
 */
export class LaunchService extends EventEmitter {
  private running = new Map<string, Running>()
  private starting = new Set<string>()

  constructor(
    private readonly db: Db,
    private readonly dataRoot: string,
    private readonly profiles: ProfileService,
    private readonly kernels: KernelService,
    private readonly proxies: ProxyService,
    private readonly options: LaunchOptions = {}
  ) {
    super()
  }

  isRunning(id: string): boolean {
    const r = this.running.get(id)
    return !!r && r.proc.exitCode === null && r.proc.signalCode === null
  }

  /** Kết nối CDP của profile đang chạy. Dùng nội bộ (test, Local API cookie ở Phase 6). */
  cdp(id: string): CdpPipe {
    const r = this.running.get(id)
    if (!r || r.cdp.isClosed) throw new IsolaError('NOT_FOUND', `Profile ${id} không chạy`)
    return r.cdp
  }

  async start(id: string): Promise<void> {
    if (this.isRunning(id) || this.starting.has(id)) throw new IsolaError('ALREADY_RUNNING')
    const profile = this.profiles.get(id)
    if (profile.deletedAt) throw new IsolaError('ARCHIVED')
    const exe = this.kernels.executablePath(profile.kernel)

    if (!profile.proxyId && !profile.lab) throw new IsolaError('PROXY_REQUIRED')

    this.starting.add(id)
    let relay: Relay | null = null
    try {
      if (profile.proxyId) {
        // Kết quả kiểm cũ hơn 6 giờ (hoặc lần trước lỗi) thì kiểm lại. Lỗi thì không spawn.
        let proxy = this.proxies.get(profile.proxyId)
        if (!this.proxies.isCheckFresh(proxy)) proxy = await this.proxies.test(proxy.id)
        if (proxy.lastCheck?.error) throw new IsolaError('PROXY_DOWN', proxy.lastCheck.error)
        if (!profile.lab && !proxy.lastCheck?.timezone) throw new IsolaError('PROXY_NO_TZ')
        relay = await Relay.start(this.proxies.upstreamUrl(proxy.id))
      }

      const userDataDir = paths.userData(this.dataRoot, id)
      mkdirSync(userDataDir, { recursive: true })

      const args = [
        `--user-data-dir=${userDataDir}`,
        '--remote-debugging-pipe',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        '--disk-cache-size=268435456',
        // WebRTC chỉ được đi qua proxy (TCP), không lộ IP thật hay IP LAN qua UDP.
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ...(relay
          ? [
              `--proxy-server=${relay.proxyServerArg}`,
              // Cấm Chrome tự phân giải DNS: mọi tên miền phải đi qua proxy.
              '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1',
              // QUIC là UDP, không đi qua HTTP proxy được.
              '--disable-quic'
            ]
          : []),
        ...(this.options.extraArgs ?? []),
        ...(profile.startUrls.length ? profile.startUrls : ['about:blank'])
      ]

      // fd 3: Chrome đọc lệnh CDP; fd 4: Chrome ghi phản hồi.
      const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
      const spawnError = new Promise<never>((_, reject) =>
        proc.once('error', (err) => reject(new IsolaError('LAUNCH_FAILED', err.message)))
      )
      const cdp = new CdpPipe(proc.stdio[3] as Writable, proc.stdio[4] as Readable)

      try {
        await Promise.race([cdp.send('Browser.getVersion'), spawnError])
      } catch (err) {
        killTree(proc)
        throw err instanceof IsolaError ? err : new IsolaError('LAUNCH_FAILED', String(err))
      }

      const entry: Running = { proc, pid: proc.pid!, cdp, relay, exited }
      relay = null // từ đây entry giữ relay và đóng nó khi process thoát
      this.running.set(id, entry)
      this.profiles.setStatus(id, 'running')
      audit(this.db, 'open', id, { pid: entry.pid, kernel: profile.kernel, proxyId: profile.proxyId })
      this.emitStatus({ id, status: 'running' })

      proc.once('exit', (code, signal) => {
        entry.relay?.close().catch(() => {})
        if (this.running.get(id) === entry) this.running.delete(id)
        this.profiles.setStatus(id, 'idle')
        audit(this.db, 'close', id, { pid: entry.pid, code, signal })
        this.emitStatus({ id, status: 'idle' })
      })
    } finally {
      // Chỉ còn khác null khi launch lỗi giữa chừng.
      await relay?.close().catch(() => {})
      this.starting.delete(id)
    }
  }

  /** Đóng êm qua CDP để Chrome ghi cookie xuống đĩa; quá 5 giây thì kill cả cây process. */
  async stop(id: string): Promise<void> {
    const r = this.running.get(id)
    if (!r) return
    r.cdp.send('Browser.close', {}, undefined, STOP_GRACE_MS).catch(() => {})
    const graceful = await Promise.race([r.exited.then(() => true), delay(STOP_GRACE_MS).then(() => false)])
    if (!graceful) {
      killTree(r.proc)
      await r.exited
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)))
  }

  private emitStatus(e: ProfileStatusEvent): void {
    this.emit('status', e)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function killTree(proc: ChildProcess): void {
  if (proc.pid === undefined || proc.exitCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } else {
    try {
      process.kill(proc.pid, 'SIGKILL')
    } catch {
      // đã chết
    }
  }
}
