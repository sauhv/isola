'use client'

import { useI18n } from '../lib/i18n'

/** Nút gạt Việt / English, nhỏ gọn cho sidebar. */
export default function LangSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { lang, setLang } = useI18n()
  if (collapsed) {
    return (
      <button className="lang-mini" title="Tiếng Việt / English" onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}>
        {lang === 'vi' ? 'VI' : 'EN'}
      </button>
    )
  }
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button className={lang === 'vi' ? 'active' : undefined} onClick={() => setLang('vi')}>
        Tiếng Việt
      </button>
      <button className={lang === 'en' ? 'active' : undefined} onClick={() => setLang('en')}>
        English
      </button>
    </div>
  )
}
