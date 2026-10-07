'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

const designCategories = [
  { label: 'Groceries', href: '/products' },
  { label: 'Premium Fruits', href: '/products' },
  { label: 'Home & Kitchen', href: '/products?category=Home' },
  { label: 'Fashion', href: '/products' },
  { label: 'Electronics', href: '/products?category=Electronics' },
  { label: 'Beauty', href: '/products' },
  { label: 'Home Improvement', href: '/products?category=Home' },
  { label: 'Sports, Toys & Luggage', href: '/products?category=Sports' },
]

export function CategoryNavigation() {
  return (
    <nav className="bg-white border-b border-gray-100 sticky top-16 z-40">
      <div className="max-w-[1200px] mx-auto px-4">
        <div className="flex gap-2.5 overflow-x-auto py-2.5 scrollbar-hide">
          {designCategories.map((cat, i) => (
            <Link
              key={cat.label}
              href={cat.href}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full flex items-center gap-1.5 transition whitespace-nowrap ${
                i === 0
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              {cat.label}
              <ChevronDown className="w-3 h-3 opacity-80" />
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
