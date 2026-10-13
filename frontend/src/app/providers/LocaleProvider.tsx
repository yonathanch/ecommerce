'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { Locale, localeStore, DEFAULT_LOCALE } from '@/lib/i18n'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
})

export function useLocale() {
  return useContext(LocaleContext)
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Start with the default (id) so server render and first client render match.
  // localStorage is only read after hydration, inside useEffect.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  // After hydration: restore the saved preference (or browser language).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('megaMart.locale')
      const parsed: Locale = stored === 'id' || stored === 'en' ? stored : DEFAULT_LOCALE
      setLocaleState(parsed)
    } catch {
      // localStorage blocked — keep the default.
    }
  }, [])

  // Keep the <html lang> attribute in sync so the document matches the locale.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // Subscribe to locale changes coming from setLocale() anywhere in the app.
  useEffect(() => {
    return localeStore.subscribe((next) => setLocaleState(next))
  }, [])

  const set = (next: Locale) => {
    try {
      window.localStorage.setItem('megaMart.locale', next)
    } catch {
      // ignore
    }
    setLocaleState(next)
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale: set }}>
      {children}
    </LocaleContext.Provider>
  )
}
