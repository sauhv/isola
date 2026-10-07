// Các bản Chrome for Testing mà Isola hỗ trợ. Ghim theo buildId đầy đủ, không theo kênh "stable",
// để mọi máy chạy đúng một bản và chromeMajor trong seed luôn khớp kernel.
export interface SupportedKernel {
  id: string
  major: number
  buildId: string
}

export const SUPPORTED_KERNELS: readonly SupportedKernel[] = [
  { id: 'cft-155', major: 155, buildId: '155.0.8059.39' }
]

export const DEFAULT_KERNEL_ID = SUPPORTED_KERNELS[0].id

export function findSupportedKernel(id: string): SupportedKernel | undefined {
  return SUPPORTED_KERNELS.find((k) => k.id === id)
}
