import { Browser, computeExecutablePath, getInstalledBrowsers, install } from '@puppeteer/browsers'
import { existsSync } from 'node:fs'
import type { KernelInfo } from '../../shared/types'
import { allKernels, findSupportedKernel, MODERN_GREASE, setSystemKernel } from '../engine/kernels'
import { detectSystemChrome } from '../engine/systemChrome'
import { IsolaError } from '../errors'

export const SYSTEM_KERNEL_ID = 'chrome-system'

/** Quản lý kernel: Chrome for Testing (tải về `{dataRoot}/kernels`) + Chrome hệ thống (phát hiện). */
export class KernelService {
  private installing = new Map<string, Promise<KernelInfo>>()

  constructor(private readonly cacheDir: string) {
    this.detectSystem()
  }

  /** Phát hiện Google Chrome chính thức trên máy và đăng ký làm kernel động. */
  private detectSystem(): void {
    const sys = detectSystemChrome()
    setSystemKernel(
      sys
        ? {
            id: SYSTEM_KERNEL_ID,
            major: sys.major,
            buildId: sys.version,
            label: `Google Chrome ${sys.major} (hệ thống)`,
            system: true,
            execPath: sys.path,
            grease: MODERN_GREASE
          }
        : null
    )
  }

  async list(): Promise<KernelInfo[]> {
    const installed = await getInstalledBrowsers({ cacheDir: this.cacheDir })
    return allKernels().map((k) => ({
      id: k.id,
      major: k.major,
      buildId: k.buildId,
      label: k.label,
      system: !!k.system,
      installed: k.system
        ? !!k.execPath && existsSync(k.execPath)
        : installed.some((b) => b.browser === Browser.CHROME && b.buildId === k.buildId)
    }))
  }

  /** Đường dẫn chrome.exe của kernel, hoặc lỗi KERNEL_MISSING nếu chưa có. */
  executablePath(id: string): string {
    const kernel = findSupportedKernel(id)
    if (!kernel) throw new IsolaError('KERNEL_UNKNOWN', `Kernel ${id} không nằm trong danh sách hỗ trợ`)
    if (kernel.system) {
      if (!kernel.execPath || !existsSync(kernel.execPath)) throw new IsolaError('KERNEL_MISSING', 'Không thấy Google Chrome trên máy')
      return kernel.execPath
    }
    const path = computeExecutablePath({ browser: Browser.CHROME, buildId: kernel.buildId, cacheDir: this.cacheDir })
    if (!existsSync(path)) throw new IsolaError('KERNEL_MISSING', `Chưa tải kernel ${id}`)
    return path
  }

  install(id: string, onProgress?: (downloaded: number, total: number) => void): Promise<KernelInfo> {
    const kernel = findSupportedKernel(id)
    if (!kernel) return Promise.reject(new IsolaError('KERNEL_UNKNOWN', `Kernel ${id} không nằm trong danh sách hỗ trợ`))
    // Chrome hệ thống không tải — đã có sẵn nếu phát hiện được.
    if (kernel.system) {
      const ok = !!kernel.execPath && existsSync(kernel.execPath)
      return ok
        ? Promise.resolve({ id: kernel.id, major: kernel.major, buildId: kernel.buildId, label: kernel.label, system: true, installed: true })
        : Promise.reject(new IsolaError('KERNEL_MISSING', 'Không thấy Google Chrome trên máy'))
    }

    // Gọi install hai lần cùng lúc sẽ ghi đè cùng thư mục; dùng chung một promise.
    let job = this.installing.get(id)
    if (!job) {
      job = install({
        browser: Browser.CHROME,
        buildId: kernel.buildId,
        cacheDir: this.cacheDir,
        downloadProgressCallback: onProgress
      })
        .then(() => ({ id: kernel.id, major: kernel.major, buildId: kernel.buildId, label: kernel.label, system: false, installed: true }))
        .finally(() => this.installing.delete(id))
      this.installing.set(id, job)
    }
    return job
  }
}
