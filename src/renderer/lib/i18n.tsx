'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'vi' | 'en'

/** Ngôn ngữ hiện tại ở cấp module, để các hàm thuần (format.ts) dùng mà không cần hook. */
export let currentLang: Lang = 'vi'

type Entry = [vi: string, en: string]

/**
 * Từ điển. Mỗi khóa: [tiếng Việt, English].
 * Thuật ngữ kỹ thuật (Proxy, Extension, Fingerprint, Kernel, WebRTC, WebGL…) giữ nguyên,
 * nên không cần đưa vào đây — viết thẳng trong JSX.
 */
export const D: Record<string, Entry> = {}

/** Thêm/gộp các khóa vào từ điển (gọi từ các module từ điển con). */
export function addDict(entries: Record<string, Entry>): void {
  Object.assign(D, entries)
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'vi', setLang: () => {} })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>('vi')
  useEffect(() => {
    try {
      const s = localStorage.getItem('isola.lang') as Lang | null
      if (s === 'en' || s === 'vi') {
        set(s)
        currentLang = s
      }
    } catch {
      /* private mode */
    }
  }, [])
  const setLang = (l: Lang) => {
    set(l)
    currentLang = l
    try {
      localStorage.setItem('isola.lang', l)
    } catch {
      /* ignore */
    }
  }
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>
}

export type TFunc = (key: string, params?: Record<string, string | number>) => string

export function useI18n(): { t: TFunc; lang: Lang; setLang: (l: Lang) => void } {
  const { lang, setLang } = useContext(Ctx)
  const t: TFunc = (key, params) => {
    const e = D[key]
    let s = e ? (lang === 'vi' ? e[0] : e[1]) : key
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
    return s
  }
  return { t, lang, setLang }
}
