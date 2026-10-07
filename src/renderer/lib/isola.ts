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
  INTERNAL: 'Lỗi nội bộ. Xem log để biết thêm.'
}

export function errorText(code: string): string {
  if (code.startsWith('INVALID_INPUT')) return `Dữ liệu không hợp lệ: ${code.slice('INVALID_INPUT: '.length)}`
  return MESSAGES[code] ?? code
}

export class ApiError extends Error {}

/** Gọi API và trả `data`, hoặc ném ApiError với thông báo tiếng Việt. */
export async function call<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p
  if (!r.ok) throw new ApiError(errorText(r.error))
  return r.data
}

export const isola = (): IsolaApi => window.isola
