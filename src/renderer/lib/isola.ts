import type { IsolaApi, Result } from '../../shared/types'

declare global {
  interface Window {
    isola: IsolaApi
  }
}

const MESSAGES: Record<string, string> = {
  NOT_FOUND: 'Không tìm thấy.',
  NAME_TAKEN: 'Tên này đã được dùng.',
  ALREADY_RUNNING: 'Profile đang chạy.',
  PROFILE_RUNNING: 'Hãy đóng profile trước.',
  ARCHIVED: 'Profile đã lưu trữ.',
  NOT_ARCHIVED: 'Profile chưa được lưu trữ.',
  PURGE_TOO_EARLY: 'Chỉ xóa vĩnh viễn sau 7 ngày lưu trữ, hoặc khi bạn xác nhận.',
  KERNEL_MISSING: 'Chưa tải kernel cho profile này. Vào mục Kernel để tải.',
  KERNEL_UNKNOWN: 'Kernel không được hỗ trợ.',
  LAUNCH_FAILED: 'Không mở được trình duyệt.',
  INVALID_INPUT: 'Dữ liệu không hợp lệ.',
  PROXY_REQUIRED: 'Profile production phải có proxy. Gán proxy, hoặc đánh dấu là profile lab.',
  PROXY_DOWN: 'Proxy không hoạt động nên profile không được mở.',
  PROXY_NO_TZ:
    'Chưa xác định được timezone của proxy nên profile production không được mở. Tải dữ liệu GeoIP ở mục Proxy rồi kiểm tra lại proxy.',
  PROXY_IN_USE: 'Proxy đang được gán cho profile. Gỡ khỏi profile trước khi xóa.',
  NO_REFRESH_URL: 'Proxy này chưa có URL đổi IP.',
  REFRESH_FAILED: 'Gọi URL đổi IP thất bại.',
  SEED_INVALID: 'Fingerprint không hợp lệ.',
  KERNEL_MISMATCH: 'Phiên bản Chrome của fingerprint không khớp kernel (kernel lệch catalog). Tạo fingerprint mới cho profile.',
  COOKIES_INVALID: 'Cookie không đúng định dạng.',
  EXT_INVALID: 'Extension không hợp lệ.',
  EXT_NOT_FOUND_IN_STORE: 'Không tìm thấy extension trên Chrome Web Store (sai ID, đã gỡ, hoặc không hỗ trợ Chrome này).',
  EXT_DOWNLOAD_FAILED: 'Không tải được extension từ Chrome Web Store.',
  EXT_ID_MISMATCH: 'File mới là một extension khác (ID không khớp).',
  EXT_NOT_STORE: 'Extension này không đến từ Web Store. Dùng Cập nhật từ file.',
  EXT_PATH_INVALID: 'Đường dẫn extension không dùng được.',
  INTERNAL: 'Lỗi nội bộ. Xem log để biết thêm.'
}

/** Lỗi từ main có dạng "CODE" hoặc "CODE: chi tiết". */
export function errorText(error: string): string {
  const sep = error.indexOf(': ')
  const code = sep >= 0 ? error.slice(0, sep) : error
  const detail = sep >= 0 ? error.slice(sep + 2) : ''
  const base = MESSAGES[code]
  if (!base) return error
  return detail ? `${base} (${detail})` : base
}

export class ApiError extends Error {}

/** Gọi API và trả `data`, hoặc ném ApiError với thông báo tiếng Việt. */
export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new ApiError(errorText(r.error))
  return r.data
}

export const isola = (): IsolaApi => window.isola
