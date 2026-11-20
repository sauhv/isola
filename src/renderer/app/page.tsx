'use client'

import App from '../App'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { I18nProvider } from '../lib/i18n'
import '../lib/strings'

export default function Page() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  )
}
