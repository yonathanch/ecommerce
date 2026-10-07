'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProductCard } from './ProductCard'
import axios from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Product {
  id: string
  name: string
  description?: string
  price: number
  stock: number
  category: string
  createdAt: string
  updatedAt: string
}

interface ProductsResponse {
  items: Product[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

function ProductListInner() {
  const searchParams = useSearchParams()
  const initialCategory = searchParams.get('category') || ''

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [sortBy, setSortBy] = useState<'name' | 'price'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, limit: 20, totalPages: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/products/categories').then((res) => setCategories(res.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedCategory(searchParams.get('category') || '')
    setPage(1)
  }, [searchParams])

  useEffect(() => {
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCategory, sortBy, sortOrder, page])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const res = await axios.get<ProductsResponse>('/products', {
        params: {
          search: search || undefined,
          category: selectedCategory || undefined,
          sortBy,
          sortOrder,
          page,
          limit: 20,
        },
      })
      setProducts(res.data.items)
      setMeta(res.data.meta)
    } catch (e) {
      console.error('Failed to load products', e)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">
          {selectedCategory || 'All Products'}
        </h1>
        <p className="text-gray-500 text-sm">
          {meta.total} product{meta.total === 1 ? '' : 's'} available
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-8 space-y-4 shadow-sm">
        <Input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="h-11 bg-gray-50 border-gray-100 focus:border-blue-500 focus:ring-blue-500 rounded-xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={selectedCategory === '' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setSelectedCategory(''); setPage(1) }}
            className="rounded-full text-xs font-semibold"
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSelectedCategory(cat); setPage(1) }}
              className="rounded-full text-xs font-semibold"
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <label className="text-sm font-medium text-gray-600">Sort by</label>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as 'name' | 'price'); setPage(1) }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="name">Name</option>
            <option value="price">Price</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => { setSortOrder(e.target.value as 'asc' | 'desc'); setPage(1) }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="asc">Low to High</option>
            <option value="desc">High to Low</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-80 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-lg font-medium text-gray-700 mb-1">No products found</p>
          <p className="text-sm text-gray-500">Try a different search or category.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {meta.totalPages > 1 && (
            <div className="flex justify-center items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Page {page} of {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(meta.totalPages, page + 1))}
                disabled={page >= meta.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ProductList() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-gray-500">Loading…</div>}>
      <ProductListInner />
    </Suspense>
  )
}
