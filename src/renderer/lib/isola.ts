import type { IsolaApi, Result } from '../../shared/types'
import { currentLang, D } from './i18n'

declare global {
  interface Window {
    isola: IsolaApi
  }
}


/** Lỗi từ main có dạng "CODE" hoặc "CODE: chi tiết". */
export function errorText(error: string): string {
  const sep = error.indexOf(': ')
  const code = sep >= 0 ? error.slice(0, sep) : error
  const detail = sep >= 0 ? error.slice(sep + 2) : ''
  const entry = D[`err.${code}`]
  const base = entry ? (currentLang === 'vi' ? entry[0] : entry[1]) : null
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
