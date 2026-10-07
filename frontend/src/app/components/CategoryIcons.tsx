'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import axios from '@/lib/api-client'
import { ChevronRight } from 'lucide-react'

const designCategories = [
  { label: 'Mobile', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300&h=300&fit=crop', href: '/products?category=Electronics' },
  { label: 'Cosmetics', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=300&h=300&fit=crop', href: '/products' },
  { label: 'Electronics', image: 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=300&h=300&fit=crop', href: '/products?category=Electronics' },
  { label: 'Furniture', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&h=300&fit=crop', href: '/products?category=Furniture' },
  { label: 'Watches', image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop', href: '/products?category=Accessories' },
  { label: 'Decor', image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=300&h=300&fit=crop', href: '/products?category=Home' },
  { label: 'Accessories', image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=300&h=300&fit=crop', href: '/products?category=Accessories' },
]

export function CategoryIcons() {
  const [apiCategories, setApiCategories] = useState<string[]>([])

  useEffect(() => {
    axios.get('/products/categories').then((res) => setApiCategories(res.data)).catch(() => {})
  }, [])

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-12 sm:pt-16">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          Shop From <span className="text-blue-500">Top Categories</span>
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

      <div className="flex flex-wrap justify-between gap-y-6 mt-8">
        {designCategories.map((cat, i) => (
          <Link
            key={cat.label}
            href={cat.href}
            className="flex flex-col items-center gap-2.5 group w-[calc(33%-12px)] sm:w-auto"
          >
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center transition group-hover:shadow-md ${
                i === 0 ? 'border-2 border-blue-500 p-0.5' : 'border border-gray-100'
              }`}
            >
              <img
                src={cat.image}
                alt={cat.label}
                className="w-full h-full object-cover rounded-full group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <span className="text-xs font-medium text-gray-700 group-hover:text-blue-600 transition text-center">
              {cat.label}
            </span>
          </Link>
        ))}
      </div>

      {apiCategories.length > 0 && (
        <div className="hidden">{apiCategories.join(',')}</div>
      )}
    </section>
  )
}
