'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const brands = [
  {
    tag: 'IPHONE',
    discount: 'UP to 80% OFF',
    logo: 'apple' as const,
    bg: '#1b1b1f',
    tagBg: 'bg-white/15',
    tagText: 'text-white',
    text: 'text-white',
    image: 'https://images.unsplash.com/photo-1592286927505-1def25115558?w=500&h=500&fit=crop',
  },
  {
    tag: 'REALME',
    discount: 'UP to 80% OFF',
    logo: 'realme' as const,
    bg: '#fbf3c7',
    tagBg: 'bg-yellow-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=500&h=500&fit=crop',
  },
  {
    tag: 'XIAOMI',
    discount: 'UP to 80% OFF',
    logo: 'mi' as const,
    bg: '#fbe9d8',
    tagBg: 'bg-orange-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    image: 'https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=500&h=500&fit=crop',
  },
  {
    tag: 'SAMSUNG',
    discount: 'UP to 70% OFF',
    logo: 'samsung' as const,
    bg: '#e3f0fd',
    tagBg: 'bg-blue-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=500&h=500&fit=crop',
  },
  {
    tag: 'SONY',
    discount: 'UP to 60% OFF',
    logo: 'sony' as const,
    bg: '#eeeeee',
    tagBg: 'bg-gray-300/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    image: 'https://images.unsplash.com/photo-1545127398-14699f92334b?w=500&h=500&fit=crop',
  },
  {
    tag: 'BOAT',
    discount: 'UP to 55% OFF',
    logo: 'boat' as const,
    bg: '#e8f7ee',
    tagBg: 'bg-green-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&h=500&fit=crop',
  },
  {
    tag: 'LENONO',
    discount: 'UP to 50% OFF',
    logo: 'lenovo' as const,
    bg: '#fdeaea',
    tagBg: 'bg-red-200/80',
    tagText: 'text-gray-800',
    text: 'text-gray-900',
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500&h=500&fit=crop',
  },
]

function BrandLogo({ type, text }: { type: string; text: string }) {
  if (type === 'apple') {
    return (
      <svg className="w-9 h-9 text-white" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    )
  }
  if (type === 'realme') {
    return (
      <span className="bg-yellow-300 text-gray-900 font-black italic text-lg px-2 py-0.5 rounded-sm tracking-tighter">
        realme
      </span>
    )
  }
  if (type === 'mi') {
    return (
      <span className="w-9 h-9 bg-orange-500 text-white font-bold text-sm rounded-lg flex items-center justify-center">
        mi
      </span>
    )
  }
  return (
    <span className={`font-black text-sm tracking-wide ${text}`}>{type.toUpperCase()}</span>
  )
}

export function FeaturedBrands() {
  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-12 sm:pt-16">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          Top <span className="text-blue-500">Electronics Brands</span>
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
        {brands.slice(0, 3).map((brand) => (
          <Link
            key={brand.tag}
            href="/products"
            className="relative rounded-xl overflow-hidden h-36 sm:h-40 flex items-center px-6 group hover:shadow-lg transition-all"
            style={{ backgroundColor: brand.bg }}
          >
            <div className="relative z-10 flex flex-col gap-3">
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded w-fit ${brand.tagBg} ${brand.tagText}`}>
                {brand.tag}
              </span>
              <BrandLogo type={brand.logo} text={brand.text} />
              <span className={`font-bold text-base sm:text-lg ${brand.text}`}>{brand.discount}</span>
            </div>
            <img
              src={brand.image}
              alt={brand.tag}
              className="absolute -right-2 bottom-0 h-[92%] w-auto max-w-[55%] object-contain group-hover:scale-105 transition-transform duration-500"
            />
          </Link>
        ))}
      </div>

      <div className="flex justify-center items-center gap-1.5 mt-5">
        <span className="h-2 w-6 rounded-full bg-blue-500" />
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-gray-300" />
        ))}
      </div>
    </section>
  )
}
