'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { ProductCard } from '@/app/products/ProductCard'

interface Brand {
  id: string
  name: string
  slug: string
  productCount: number
}

interface Product {
  id: string
  name: string
  price: number
  stock: number
  available?: number
  category: string
  images?: { url: string; position?: number }[]
}

interface ProductsResponse {
  items: Product[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

/**
 * Dedicated page per fashion label (/brands/verse, /brands/thread, …).
 * Both requests come from the catalog itself: the brand header from
 * /products/brands and the grid from the ?brand=slug filter, so a brand added
 * in the database appears here without a code change.
 */
export default function BrandPage() {
  const params = useParams()
  const slug = params.slug as string

  const [brand, setBrand] = useState<Brand | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setNotFound(false)
      try {
        const [brandsRes, productsRes] = await Promise.all([
          apiClient.get<Brand[]>('/products/brands'),
          apiClient.get<ProductsResponse>('/products', {
            params: { brand: slug, sortBy: 'createdAt', sortOrder: 'desc', limit: 100 },
          }),
        ])
        if (cancelled) return

        const match = Array.isArray(brandsRes.data)
          ? brandsRes.data.find((b) => b.slug === slug) ?? null
          : null
        if (!match) {
          setNotFound(true)
          return
        }

        setBrand(match)
        setProducts(productsRes.data.items)
        setTotal(productsRes.data.meta.total)
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 h-10 w-56 animate-pulse rounded bg-gray-100" />
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl border border-gray-100 bg-white" />
          ))}
        </div>
      </div>
    )
  }

  if (notFound || !brand) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <p className="mb-4 text-lg font-medium text-gray-700">Brand tidak ditemukan</p>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Kembali ke beranda
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/" className="transition hover:text-blue-600">
          Beranda
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">{brand.name}</span>
      </nav>

      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-bold uppercase tracking-wide text-gray-900 sm:text-3xl">
          {brand.name}
        </h1>
        <p className="text-sm text-gray-500">{total} produk tersedia</p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-20 text-center shadow-sm">
          <p className="text-lg font-medium text-gray-700 mb-1">Belum ada produk</p>
          <p className="text-sm text-gray-500">Brand ini belum memiliki produk di katalog.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
