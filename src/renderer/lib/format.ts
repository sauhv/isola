import { currentLang, D } from './i18n'

const tr = (k: string, n?: number) => {
  const e = D[k]
  const base = e ? (currentLang === 'vi' ? e[0] : e[1]) : k
  return n === undefined ? base : base.split('{n}').join(String(n))
}

let regionLang: string | null = null
let regionNames: Intl.DisplayNames | null = null

/** "VN" → "Việt Nam". Trả lại mã nếu không dịch được. */
export function countryName(code: string | null | undefined): string {
  if (!code) return ''
  try {
    if (!regionNames || regionLang !== currentLang) {
      regionLang = currentLang
      regionNames = new Intl.DisplayNames([currentLang], { type: 'region' })
    }
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Ngày và giờ tách hai dòng như bảng profile: "10-07" / "11:02:07". */
export function dateTimeParts(iso: string | null): [string, string] | null {
  if (!iso) return null
  const d = new Date(iso)
  return [`${pad(d.getDate())}-${pad(d.getMonth() + 1)}`, `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`]
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (min < 1) return tr('time.now')
  if (min < 60) return tr('time.min', min)
  const h = Math.round(min / 60)
  return h < 48 ? tr('time.hour', h) : tr('time.day', Math.round(h / 24))
}

/** Màu ổn định theo chuỗi, dùng cho badge nền tảng. */
export function colorFor(text: string): string {
  const known: Record<string, string> = {
    facebook: '#1877f2',
    fb: '#1877f2',
    tiktok: '#111111',
    google: '#ea4335',
    gmail: '#ea4335',
    youtube: '#ff0000',
    amazon: '#ff9900',
    shopee: '#ee4d2d',
    instagram: '#c13584',
    twitter: '#1d9bf0',
    x: '#333333',
    telegram: '#229ed9',
    discord: '#5865f2'
  }
  const k = text.trim().toLowerCase()
  if (known[k]) return known[k]
  let h = 0
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h}, 45%, 42%)`
}
