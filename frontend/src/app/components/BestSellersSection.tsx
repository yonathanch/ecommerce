'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useLocale } from '@/app/providers/LocaleProvider'
import { t } from '@/lib/i18n'
import apiClient from '@/lib/api-client'

interface BestSeller {
  id: string
  name: string
}

/**
 * Home-page replacement for the old brand showcase: a names-only list of best
 * sellers (no price, stock or photo) so the row stays a quick spotlight. Each
 * name links to its product page, and the hover state uses the site's blue so
 * it matches every other section.
 */
export function BestSellersSection() {
  const locale = useLocale().locale
  const [items, setItems] = useState<BestSeller[]>([])

  useEffect(() => {
    apiClient
      .get('/products/best-sellers?limit=10')
      .then((res) => {
        if (Array.isArray(res.data)) setItems(res.data)
      })
      .catch(() => {
        // Decorative section — the homepage renders fine without it.
      })
  }, [])

  if (items.length === 0) return null

  // "Produk Terlaris" → accent the last word, matching the other section
  // headers ("Top Fashion Brands", "Wardrobe Essentials", …).
  const title = t('bestSellers', 'title', locale)
  const splitAt = title.lastIndexOf(' ')
  const head = splitAt > 0 ? title.slice(0, splitAt) : title
  const tail = splitAt > 0 ? title.slice(splitAt + 1) : ''

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-12 sm:pt-16">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          {head} <span className="text-blue-500">{tail}</span>
        </h2>
        <Link
          href="/products"
          className="pb-3 flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-blue-600 transition"
        >
          View All
          <ChevronRight className="w-4 h-4 text-blue-500" />
        </Link>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gray-200" />
      </div>

      <div className="flex flex-wrap gap-2.5 mt-6">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products/${item.id}`}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600"
          >
            {item.name}
          </Link>
        ))}
      </div>
    </section>
  )
}
