// Mã lỗi trả về renderer qua `{ ok: false, error }`. Renderer dịch mã sang tiếng Việt.
export type ErrorCode =
  | 'NOT_FOUND'
  | 'NAME_TAKEN'
  | 'INVALID_INPUT'
  | 'ALREADY_RUNNING'
  | 'PROFILE_RUNNING'
  | 'ARCHIVED'
  | 'NOT_ARCHIVED'
  | 'PURGE_TOO_EARLY'
  | 'KERNEL_MISSING'
  | 'KERNEL_UNKNOWN'
  | 'LAUNCH_FAILED'
  | 'PROXY_REQUIRED'
  | 'PROXY_DOWN'
  | 'PROXY_NO_TZ'
  | 'PROXY_IN_USE'
  | 'NO_REFRESH_URL'
  | 'REFRESH_FAILED'
  | 'EXT_INVALID'
  | 'EXT_NOT_FOUND_IN_STORE'
  | 'EXT_DOWNLOAD_FAILED'
  | 'EXT_ID_MISMATCH'
  | 'EXT_NOT_STORE'
  | 'EXT_PATH_INVALID'

export class IsolaError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'IsolaError'
  }
}
