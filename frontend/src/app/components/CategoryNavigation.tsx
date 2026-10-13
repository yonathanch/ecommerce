'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLocale } from '@/app/providers/LocaleProvider'
import { t } from '@/lib/i18n'
import apiClient from '@/lib/api-client'

/**
 * Fallback used only when `/products/categories` cannot be reached, so the
 * storefront never renders an empty navigation bar. Category names themselves
 * are product catalog data, not UI strings, so they stay in the seeded
 * language (Indonesian) regardless of the UI locale.
 */
const FALLBACK_CATEGORIES = [
  'Baju Wanita',
  'Baju Pria',
  'Baju Anak',
  'Aksesoris',
  'Sweater & Jacket',
  'Sepatu Wanita',
  'Sepatu Pria',
  'Sepatu Anak',
]

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
        active
          ? 'bg-blue-500 text-white hover:bg-blue-600'
          : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      {label}
    </Link>
  )
}

function NavShell({ children }: { children?: React.ReactNode }) {
  return (
    <nav className="sticky top-16 z-40 border-b border-gray-100 bg-white">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="scrollbar-hide flex gap-2.5 overflow-x-auto py-2.5">{children}</div>
      </div>
    </nav>
  )
}

interface BestSeller {
  id: string
  name: string
}

function CategoryNavInner() {
  const locale = useLocale().locale
  const pathname = usePathname()
  // On the home page the category chips are replaced by the best sellers, so
  // shoppers land straight on the products that actually move. Every other
  // page keeps the full category navigation.
  const isHome = pathname === '/'
  // Categories come from the catalog itself, so adding one in the admin
  // dashboard makes it show up here without a code change.
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES)
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([])
  const activeCategory = useSearchParams().get('category') ?? ''

  useEffect(() => {
    apiClient
      .get('/products/categories')
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) setCategories(res.data)
      })
      .catch(() => {
        // Keep the fallback list; the products page shows its own error state.
      })
  }, [])

  useEffect(() => {
    if (!isHome) {
      setBestSellers([])
      return
    }
    apiClient
      .get('/products/best-sellers?limit=10')
      .then((res) => {
        if (Array.isArray(res.data)) setBestSellers(res.data)
      })
      .catch(() => {
        // Keep the category chips; a hiccup here must not empty the bar.
      })
  }, [isHome])

  return (
    <NavShell>
      {/* "Semua Produk" stays put on every page. */}
      <Chip href="/products" label={t('categories', 'allProducts', locale)} active={activeCategory === ''} />
      {isHome
        ? bestSellers.map((item) => (
            <Link
              key={item.id}
              href={`/products/${item.id}`}
              className="shrink-0 whitespace-nowrap rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600"
            >
              {item.name}
            </Link>
          ))
        : categories.map((category) => (
            <Chip
              key={category}
              href={`/products?category=${encodeURIComponent(category)}`}
              label={category}
              active={activeCategory === category}
            />
          ))}
    </NavShell>
  )
}

export function CategoryNavigation() {
  // useSearchParams needs a Suspense boundary in the App Router; the shell is
  // the fallback so the bar keeps its height while it hydrates.
  return (
    <Suspense fallback={<NavShell />}>
      <CategoryNavInner />
    </Suspense>
  )
}
