'use client'

import App from '../App'
import { I18nProvider } from '../lib/i18n'
import '../lib/strings'

export default function Page() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  )
}
