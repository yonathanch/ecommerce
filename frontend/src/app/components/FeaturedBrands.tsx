'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import apiClient from '@/lib/api-client'

interface Brand {
  id: string
  name: string
  slug: string
  productCount: number
}

/**
 * Card styles cycle deterministically by index so every brand from the
 * database gets a background/photo pairing without storing presentation data
 * in the backend.
 *
 * Each card shows the brand name and links to that brand's page
 * (/brands/<slug>), which lists all of its products.
 */
const cardStyles = [
  {
    bg: '#1b1b1f',
    tagBg: 'bg-white/15',
    tagText: 'text-white',
    text: 'text-white',
    meta: 'text-white/70',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop',
  },
  {
    bg: '#fbe9d8',
    tagBg: 'bg-orange-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    meta: 'text-gray-600',
    image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&h=500&fit=crop',
  },
  {
    bg: '#1b1b1f',
    tagBg: 'bg-white/15',
    tagText: 'text-white',
    text: 'text-white',
    meta: 'text-white/70',
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=500&h=500&fit=crop',
  },
  {
    bg: '#e3f0fd',
    tagBg: 'bg-blue-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    meta: 'text-gray-600',
    image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=500&h=500&fit=crop',
  },
  {
    bg: '#eeeeee',
    tagBg: 'bg-gray-300/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    meta: 'text-gray-600',
    image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=500&h=500&fit=crop',
  },
]

export function FeaturedBrands() {
  const [brands, setBrands] = useState<Brand[]>([])

  useEffect(() => {
    apiClient
      .get('/products/brands')
      .then((res) => {
        if (Array.isArray(res.data)) setBrands(res.data)
      })
      .catch(() => {
        // Decorative section — the homepage renders fine without it.
      })
  }, [])

  if (brands.length === 0) return null

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-12 sm:pt-16">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          Top <span className="text-blue-500">Popular Brand</span>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {brands.map((brand, index) => {
          const style = cardStyles[index % cardStyles.length]
          return (
            <Link
              key={brand.id}
              href={`/brands/${brand.slug}`}
              className="relative rounded-xl overflow-hidden h-36 sm:h-40 flex items-center px-6 group hover:shadow-lg transition-all"
              style={{ backgroundColor: style.bg }}
            >
              <div className="relative z-10 flex flex-col gap-3">
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded w-fit ${style.tagBg} ${style.tagText}`}>
                  {brand.name}
                </span>
                <span className={`font-black text-sm tracking-wide ${style.text}`}>{brand.name}</span>
                <span className={`font-bold text-base sm:text-lg ${style.text}`}>
                  {brand.productCount} Produk
                </span>
              </div>
              <img
                src={style.image}
                alt={brand.name}
                className="absolute -right-2 bottom-0 h-[92%] w-auto max-w-[55%] object-contain group-hover:scale-105 transition-transform duration-500"
              />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
