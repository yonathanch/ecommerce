'use client'

import Link from 'next/link'
import { useLocale } from '@/app/providers/LocaleProvider'
import { t, LOCALES, Locale } from '@/lib/i18n'
import { Info, Globe } from 'lucide-react'

export function TopBar() {
  const { locale, setLocale } = useLocale()

  return (
    <div className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-9 max-w-[1200px] items-center justify-between gap-3 px-4 text-xs text-gray-500">
        <span className="hidden font-medium text-gray-500 sm:inline">
          {t('topbar', 'welcome', locale)}
        </span>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-5">
          <Link
            href="/products"
            className="flex items-center gap-1.5 whitespace-nowrap text-gray-600 transition hover:text-blue-600"
          >
            <Info className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span>{t('topbar', 'allOffers', locale)}</span>
          </Link>

          {/* Pengalih bahasa — satu-satunya ada di sini (TopBar). */}
          <div
            className="flex items-center gap-1.5 whitespace-nowrap text-gray-600"
            role="group"
            aria-label={t('topbar', 'language', locale)}
          >
            <Globe className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <div className="flex overflow-hidden rounded border border-gray-200">
              {LOCALES.map((option) => {
                const active = option.code === locale
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => setLocale(option.code as Locale)}
                    aria-pressed={active}
                    className={`px-2 py-0.5 text-xs font-medium transition ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                  >
                    {option.code === 'id' ? 'ID' : 'EN'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
