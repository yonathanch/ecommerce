'use client'

import { useLocale } from '@/app/providers/LocaleProvider'
import { t } from '@/lib/i18n'

const popularCategoriesId = [
  'Bahan Pokok',
  'Minuman',
  'Perawatan Diri',
  'Perawatan Rumah',
  'Perawatan Bayi',
  'Sayuran & Buah',
  'Camilan & Makanan',
  'Susu & Kue',
]

const popularCategoriesEn = [
  'Staples',
  'Beverages',
  'Personal Care',
  'Home Care',
  'Baby Care',
  'Vegetables & Fruits',
  'Snacks & Foods',
  'Dairy & Bakery',
]

const customerServicesId = [
  'Tentang Kami',
  'Syarat & Ketentuan',
  'FAQ',
  'Kebijakan Privasi',
  'Kebijakan Limbah Elektronik',
  'Pembatalan & Kebijakan Pengembalian',
]

const customerServicesEn = [
  'About Us',
  'Terms & Conditions',
  'FAQ',
  'Privacy Policy',
  'E-Waste Policy',
  'Cancellation & Return Policy',
]

function AppStoreBadge({ locale }: { locale: ReturnType<typeof useLocale>['locale'] }) {
  return (
    <a
      href="#"
      className="flex items-center gap-2 bg-black text-white rounded-md px-3 py-1.5 hover:opacity-90 transition border border-gray-600"
    >
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[7px] uppercase tracking-wide text-gray-300">
          {locale === 'en' ? 'Download on the' : 'Unduh di'}
        </span>
        <span className="block text-sm font-semibold">App Store</span>
      </span>
    </a>
  )
}

function GooglePlayBadge({ locale }: { locale: ReturnType<typeof useLocale>['locale'] }) {
  return (
    <a
      href="#"
      className="flex items-center gap-2 bg-black text-white rounded-md px-3 py-1.5 hover:opacity-90 transition border border-gray-600"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.6 2.7c-.3.3-.5.8-.5 1.4v15.8c0 .6.2 1.1.5 1.4l.1.1 8.9-8.9v-.2L3.7 2.6l-.1.1zm12 6.9L13 6.9 4.5 2.1c-.3-.2-.6-.2-.8-.1l11.9 7.6zM4.5 21.9c.2.1.5.1.8-.1L13 17.1l2.6-2.6-11.1 7.4zm14.9-9.2-2.7-1.6-2.9 2.9 2.9 2.9 2.7-1.6c.8-.5.8-1.5 0-2z" />
      </svg>
      <span className="leading-tight">
        <span className="block text-[7px] uppercase tracking-wide text-gray-300">
          {locale === 'en' ? 'Get it on' : 'Rasakan di'}
        </span>
        <span className="block text-sm font-semibold">Google Play</span>
      </span>
    </a>
  )
}

export function Footer() {
  const locale = useLocale().locale

  const popularCategories =
    locale === 'en' ? popularCategoriesEn : popularCategoriesId
  const customerServices =
    locale === 'en' ? customerServicesEn : customerServicesId

  return (
    <footer className="relative overflow-hidden bg-[#3e86c7] text-white">
      {/* Dekorasi lingkaran */}
      <div className="absolute -right-32 -top-20 w-[380px] h-[380px] rounded-full bg-white/5" />
      <div className="absolute -right-10 bottom-0 w-[260px] h-[260px] rounded-full border border-white/10" />

      <div className="max-w-[1200px] mx-auto px-4 pt-10 pb-6 relative">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Kolom kiri */}
          <div className="space-y-5">
            <h3 className="text-3xl font-bold tracking-tight">OUTFITX</h3>

            <div>
              <h4 className="font-semibold text-base pb-1.5 border-b border-white/50 w-fit">
                {t('footer', 'contactUs', locale)}
              </h4>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.1-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
                  </svg>
                  <span>
                    <span className="block text-xs text-white/80">What&apos;s App</span>
                    <span className="text-sm font-medium">+1 202-918-2132</span>
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2z" />
                  </svg>
                  <span>
                    <span className="block text-xs text-white/80">Call Us</span>
                    <span className="text-sm font-medium">+1 202-918-2132</span>
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-base">
                {t('footer', 'downloadApp', locale)}
              </h4>
              <div className="flex gap-3 mt-3">
                <AppStoreBadge locale={locale} />
                <GooglePlayBadge locale={locale} />
              </div>
            </div>
          </div>

          {/* Kolom tengah */}
          <div className="md:pt-2">
            <h4 className="font-semibold text-base pb-1.5 border-b border-white/50 w-full md:max-w-[220px]">
              {t('footer', 'popularCategories', locale)}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-white/90">
              {popularCategories.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-white/80" />
                  <a href="#" className="hover:text-white hover:underline transition">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Kolom kanan */}
          <div className="md:pt-2">
            <h4 className="font-semibold text-base pb-1.5 border-b border-white/50 w-full md:max-w-[220px]">
              {t('footer', 'customerServices', locale)}
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-white/90">
              {customerServices.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-white/80" />
                  <a href="#" className="hover:text-white hover:underline transition">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/30 mt-8 pt-4 text-center text-xs text-white/80">
          {locale === 'en'
            ? '© 2022 All rights reserved. Reliance Retail Ltd.'
            : '© 2022 Semua hak dilindungi. Reliance Retail Ltd.'}
        </div>
      </div>
    </footer>
  )
}
