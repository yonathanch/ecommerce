'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const essentials = [
  {
    name: 'Baju Wanita',
    discount: 'UP TO 60% OFF',
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=400&fit=crop',
  },
  {
    name: 'Baju Pria',
    discount: 'UP TO 55% OFF',
    image: 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?w=400&h=400&fit=crop',
  },
  {
    name: 'Baju Anak',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1503944583220-79d8926ad5e2?w=400&h=400&fit=crop',
  },
  {
    name: 'Sweater & Jacket',
    discount: 'UP TO 65% OFF',
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=400&fit=crop',
  },
  {
    name: 'Sepatu Pria',
    discount: 'UP TO 45% OFF',
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=400&fit=crop',
  },
  {
    name: 'Aksesoris',
    discount: 'UP TO 40% OFF',
    image: 'https://images.unsplash.com/photo-1523779917675-b6ed3a42a561?w=400&h=400&fit=crop',
  },
]

export function DailyEssentialsSection() {
  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-12 sm:pt-16 pb-14">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          Wardrobe <span className="text-blue-500">Essentials</span>
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

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4 mt-6">
        {essentials.map((item, idx) => (
          <Link
            key={idx}
            href={`/products?category=${encodeURIComponent(item.name)}`}
            className="group cursor-pointer"
          >
            <div
              className={`relative aspect-square rounded-lg overflow-hidden bg-[#f4f5f7] transition-all ${
                idx === 0
                  ? 'border-2 border-blue-500 shadow-[0_4px_16px_rgba(59,130,246,0.22)]'
                  : 'border border-gray-100 group-hover:border-blue-300'
              }`}
            >
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <h3 className="text-xs text-gray-700 text-center mt-2 group-hover:text-blue-600 transition-colors">
              {item.name}
            </h3>
            <p className="text-[13px] font-semibold text-gray-900 text-center">{item.discount}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
