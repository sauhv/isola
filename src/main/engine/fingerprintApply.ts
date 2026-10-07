import type { CdpPipe } from './cdpPipe'
import { buildPageScript, buildWorkerScript } from './fingerprintScript'
import type { EffectiveFingerprint } from './seed'

const PAGE_TYPES = new Set(['page', 'iframe'])
const WORKER_TYPES = new Set(['worker', 'shared_worker', 'service_worker'])

/**
 * Gắn fingerprint vào mọi target của một trình duyệt qua CDP.
 *
 * Target.setAutoAttach (waitForDebuggerOnStart) ở cấp browser làm mọi tab, popup, iframe khác
 * process và worker mới dừng lại chờ. Isola áp override rồi mới cho chạy, nên script của trang
 * không bao giờ thấy giá trị thật. Không gọi Runtime.enable (dấu hiệu tự động hóa phổ biến).
 */
export class FingerprintController {
  private readonly pageScript: string
  private readonly workerScript: string
  private readonly pending = new Set<Promise<void>>()
  /** sessionId → targetId của các tab đã gắn. */
  readonly pages = new Map<string, string>()
  /** Tab đã có trước khi gắn (Chrome khôi phục phiên cũ): đã tải mà chưa có fingerprint. */
  private readonly preexisting: { sessionId: string; url: string }[] = []

  constructor(
    private readonly cdp: CdpPipe,
    private readonly fp: EffectiveFingerprint
  ) {
    this.pageScript = buildPageScript(fp)
    this.workerScript = buildWorkerScript(fp)
    cdp.on('event', (method: string, params: any) => {
      if (method === 'Target.attachedToTarget') this.track(this.onAttached(params.sessionId, params.targetInfo, params.waitingForDebugger))
      if (method === 'Target.detachedFromTarget') this.pages.delete(params.sessionId)
    })
  }

  /** Bật auto-attach ở cấp browser và đợi áp xong cho các target đang có. */
  async start(): Promise<void> {
    await this.cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: 'browser', exclude: true }, { type: 'tab', exclude: true }, {}]
    })
    await this.settled()
    // Tab tải trước khi gắn thì tải lại để chạy với fingerprint.
    for (const { sessionId, url } of this.preexisting) {
      if (url && url !== 'about:blank' && !url.startsWith('chrome')) {
        await this.cdp.send('Page.reload', { ignoreCache: false }, sessionId).catch(() => undefined)
      }
    }
    this.preexisting.length = 0
  }

  /** Đợi mọi lượt áp override đang chạy xong. */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending])
  }

  private track(p: Promise<void>): void {
    this.pending.add(p)
    p.finally(() => this.pending.delete(p))
  }

  private get userAgentOverride() {
    const fp = this.fp
    return {
      userAgent: fp.seed.userAgent,
      acceptLanguage: fp.acceptLanguage,
      platform: fp.seed.platform,
      userAgentMetadata: fp.userAgentMetadata
    }
  }

  private async onAttached(sessionId: string, info: { type: string; targetId: string; url?: string }, waiting: boolean): Promise<void> {
    if (info.type === 'page' && !waiting) this.preexisting.push({ sessionId, url: info.url ?? '' })
    const send = (method: string, params: object = {}) => this.cdp.send(method, params, sessionId).catch(() => undefined)
    try {
      if (PAGE_TYPES.has(info.type)) {
        if (info.type === 'page') this.pages.set(sessionId, info.targetId)
        // runImmediately: tab tạo bằng createTarget/popup đang giữ document đầu tiên; thiếu cờ này
        // script chỉ chạy từ lần điều hướng sau (đo trên CfT 155). Mỗi document vẫn chỉ chạy một lần.
        await send('Page.addScriptToEvaluateOnNewDocument', { source: this.pageScript, runImmediately: true })
        await Promise.all([
          send('Emulation.setUserAgentOverride', this.userAgentOverride),
          send('Emulation.setTimezoneOverride', { timezoneId: this.fp.timezone }),
          send('Emulation.setLocaleOverride', { locale: this.fp.language }),
          send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: this.fp.seed.hardware.cores }),
          // iframe khác process và worker con của trang cũng phải dừng chờ.
          send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true })
        ])
      } else if (WORKER_TYPES.has(info.type)) {
        await Promise.all([
          send('Network.setUserAgentOverride', this.userAgentOverride),
          send('Runtime.evaluate', { expression: this.workerScript, silent: true })
        ])
      }
    } finally {
      if (waiting) await send('Runtime.runIfWaitingForDebugger')
    }
  }
}
