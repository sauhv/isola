// Kernel = bản Chrome để spawn. Có 2 loại:
//  - Chrome for Testing (CfT): ghim theo buildId, Isola tự tải; chromeMajor trong seed luôn khớp.
//  - Chrome hệ thống: bản Google Chrome chính thức cài trên máy (đăng ký động lúc khởi động).
export interface SupportedKernel {
  id: string
  major: number
  buildId: string
  /** Nhãn hiển thị ở ô chọn Browser. */
  label: string
  /** true nếu là Chrome chính thức cài trên máy (không tải, dùng đường dẫn execPath). */
  system?: boolean
  /** Đường dẫn chrome.exe (chỉ kernel hệ thống). */
  execPath?: string
  /**
   * Brand GREASE mà chính bản Chromium này sinh ra (đo từ navigator.userAgentData của kernel).
   * Isola thêm brand "Google Chrome" theo đúng thuật toán xếp thứ tự của Chromium.
   */
  grease: { brand: string; version: string }
}

// GREASE của Chrome đời mới (đo từ CfT 155). Dùng lại cho kernel hệ thống đời gần (brand GREASE
// được thiết kế để site bỏ qua, nên lệch nhẹ rủi ro thấp).
export const MODERN_GREASE = { brand: 'Not(A:Brand', version: '24' }

const CFT_KERNELS: readonly SupportedKernel[] = [
  { id: 'cft-155', major: 155, buildId: '155.0.8059.39', label: 'Chrome for Testing 155', grease: { brand: 'Not(A:Brand', version: '24' } }
]

// Kernel Chrome hệ thống, đăng ký lúc khởi động nếu phát hiện được.
let systemKernel: SupportedKernel | null = null

export function setSystemKernel(k: SupportedKernel | null): void {
  systemKernel = k
}

/** Tất cả kernel hiện có (CfT + Chrome hệ thống nếu có). */
export function allKernels(): SupportedKernel[] {
  return systemKernel ? [...CFT_KERNELS, systemKernel] : [...CFT_KERNELS]
}

/** Giữ tương thích: danh sách CfT tĩnh (cho nơi chỉ cần CfT). */
export const SUPPORTED_KERNELS = CFT_KERNELS

export function kernelByMajor(major: number): SupportedKernel | undefined {
  return allKernels().find((k) => k.major === major)
}

export const DEFAULT_KERNEL_ID = CFT_KERNELS[0].id

export function findSupportedKernel(id: string): SupportedKernel | undefined {
  return allKernels().find((k) => k.id === id)
}
