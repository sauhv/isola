import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  allKernels,
  DEFAULT_KERNEL_ID,
  findSupportedKernel,
  kernelByMajor,
  setSystemKernel,
  type SupportedKernel
} from '../src/main/engine/kernels'

const sys: SupportedKernel = {
  id: 'chrome-system',
  major: 142,
  buildId: '142.0.7444.135',
  label: 'Google Chrome 142 (hệ thống)',
  system: true,
  execPath: 'C:/x/chrome.exe',
  grease: { brand: 'Not(A:Brand', version: '24' }
}

beforeEach(() => setSystemKernel(null))
afterEach(() => setSystemKernel(null))

describe('kernel registry động', () => {
  it('mặc định chỉ có CfT', () => {
    expect(allKernels().map((k) => k.id)).toEqual([DEFAULT_KERNEL_ID])
    expect(findSupportedKernel('chrome-system')).toBeUndefined()
  })

  it('đăng ký Chrome hệ thống: tìm theo id và theo major', () => {
    setSystemKernel(sys)
    expect(allKernels().map((k) => k.id)).toContain('chrome-system')
    expect(findSupportedKernel('chrome-system')?.major).toBe(142)
    expect(kernelByMajor(142)?.id).toBe('chrome-system')
    // CfT vẫn còn
    expect(findSupportedKernel(DEFAULT_KERNEL_ID)).toBeDefined()
  })

  it('gỡ Chrome hệ thống', () => {
    setSystemKernel(sys)
    setSystemKernel(null)
    expect(findSupportedKernel('chrome-system')).toBeUndefined()
    expect(kernelByMajor(142)).toBeUndefined()
  })
})
