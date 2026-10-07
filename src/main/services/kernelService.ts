import { Browser, computeExecutablePath, getInstalledBrowsers, install } from '@puppeteer/browsers'
import { existsSync } from 'node:fs'
import type { KernelInfo } from '../../shared/types'
import { findSupportedKernel, SUPPORTED_KERNELS } from '../engine/kernels'
import { IsolaError } from '../errors'

/** Quản lý các bản Chrome for Testing trong `{dataRoot}/kernels`. */
export class KernelService {
  private installing = new Map<string, Promise<KernelInfo>>()

  constructor(private readonly cacheDir: string) {}

  async list(): Promise<KernelInfo[]> {
    const installed = await getInstalledBrowsers({ cacheDir: this.cacheDir })
    return SUPPORTED_KERNELS.map((k) => ({
      ...k,
      installed: installed.some((b) => b.browser === Browser.CHROME && b.buildId === k.buildId)
    }))
  }

  /** Đường dẫn chrome.exe của kernel, hoặc lỗi KERNEL_MISSING nếu chưa tải. */
  executablePath(id: string): string {
    const kernel = findSupportedKernel(id)
    if (!kernel) throw new IsolaError('KERNEL_UNKNOWN', `Kernel ${id} không nằm trong danh sách hỗ trợ`)
    const path = computeExecutablePath({ browser: Browser.CHROME, buildId: kernel.buildId, cacheDir: this.cacheDir })
    if (!existsSync(path)) throw new IsolaError('KERNEL_MISSING', `Chưa tải kernel ${id}`)
    return path
  }

  install(id: string, onProgress?: (downloaded: number, total: number) => void): Promise<KernelInfo> {
    const kernel = findSupportedKernel(id)
    if (!kernel) return Promise.reject(new IsolaError('KERNEL_UNKNOWN', `Kernel ${id} không nằm trong danh sách hỗ trợ`))

    // Gọi install hai lần cùng lúc sẽ ghi đè cùng thư mục; dùng chung một promise.
    let job = this.installing.get(id)
    if (!job) {
      job = install({
        browser: Browser.CHROME,
        buildId: kernel.buildId,
        cacheDir: this.cacheDir,
        downloadProgressCallback: onProgress
      })
        .then(() => ({ ...kernel, installed: true }))
        .finally(() => this.installing.delete(id))
      this.installing.set(id, job)
    }
    return job
  }
}
