'use client'

import { useState, useEffect } from 'react'
import axios from '@/lib/api-client'
import { ProductCard } from '@/app/products/ProductCard'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface Product {
  id: string
  name: string
  description?: string
  price: number
  stock: number
  category: string
}

export function ProductDealSection() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/products?limit=5&sortBy=price&sortOrder=desc')
      .then((res) => {
        setProducts(res.data.items || res.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <section className="max-w-[1200px] mx-auto px-4 pt-10 sm:pt-14">
      <div className="relative flex items-end justify-between">
        <h2 className="relative z-10 pb-3 text-xl sm:text-2xl font-semibold text-gray-800 border-b-2 border-blue-500">
          Grab the best deal on <span className="text-blue-500">Smartphones</span>
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 mt-6">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-gray-200 overflow-hidden animate-pulse">
                <div className="h-40 sm:h-44 bg-gray-100" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            ))
          : products.slice(0, 5).map((product, i) => (
              <ProductCard key={product.id} product={product} featured={i === 1} />
            ))}
      </div>
    </section>
  )
}
