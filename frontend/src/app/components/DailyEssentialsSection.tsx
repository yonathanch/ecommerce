'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const essentials = [
  {
    name: 'Daily Essentials',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=400&fit=crop',
  },
  {
    name: 'Vegitables',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop',
  },
  {
    name: 'Fruits',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400&h=400&fit=crop',
  },
  {
    name: 'Strawberry',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&h=400&fit=crop',
  },
  {
    name: 'Mango',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&h=400&fit=crop',
  },
  {
    name: 'Cherry',
    discount: 'UP TO 50% OFF',
    image: 'https://images.unsplash.com/photo-1528821128474-27f963b062bf?w=400&h=400&fit=crop',
  },
]

export function DailyEssentialsSection() {
  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-12 sm:pt-16 pb-14">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          Daily <span className="text-blue-500">Essentials</span>
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
            href={`/products?search=${encodeURIComponent(item.name)}`}
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
