'use client'

import Link from 'next/link'
import { formatRupiah } from '@/lib/format'

interface Product {
  id: string
  name: string
  description?: string
  price: number
  stock: number
  available?: number
  category: string
  images?: Array<{ url: string; position?: number }>
}

interface ProductCardProps {
  product: Product
  featured?: boolean
}

/**
 * Category → stable placeholder photo key, used only for products without
 * their own image, so a card never renders an unrelated random photo.
 */
const categoryImageKeys: Record<string, string> = {
  'Baju Wanita': 'fashion-wanita',
  'Baju Pria': 'fashion-pria',
  'Baju Anak': 'fashion-anak',
  Aksesoris: 'aksesoris',
  'Sweater & Jacket': 'sweater',
  'Sepatu Pria': 'sepatu-pria',
  'Sepatu Wanita': 'sepatu-wanita',
  'Sepatu Anak': 'sepatu-anak',
}

/**
 * Products created through the admin dashboard may have no image attached yet.
 * The seeded catalog stores its own photo per variant, so this fallback only
 * has to keep the grid from rendering an empty area. The seed is stable per
 * product, so the same product keeps the same placeholder across reloads.
 */
function resolveImage(product: Product) {
  const own = product.images?.find((image) => image?.url)?.url
  if (own) return own

  const key = categoryImageKeys[product.category] ?? 'fashion'
  return `https://picsum.photos/seed/${key}-${product.id.slice(-6)}/800/1000`
}

export function ProductCard({ product, featured = false }: ProductCardProps) {
  const available = product.available ?? product.stock
  const soldOut = available <= 0

  return (
    <Link
      href={`/products/${product.id}`}
      className={`group flex h-full flex-col overflow-hidden rounded-lg bg-white transition-all duration-300 ${
        featured
          ? 'border-2 border-blue-500 shadow-[0_4px_20px_rgba(59,130,246,0.25)]'
          : 'border border-gray-200 hover:border-blue-300 hover:shadow-md'
      }`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#f4f5f7]">
        {/* Catalog images are arbitrary aspect ratios, so cover-crop instead of
            letterboxing them inside a padded box. */}
        <img
          src={resolveImage(product)}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-gray-900/80 py-1 text-center text-[11px] font-semibold text-white">
            Stok habis
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <h3 className="line-clamp-2 min-h-[34px] text-xs font-semibold leading-snug text-gray-900 sm:text-[13px]">
          {product.name}
        </h3>

        <p className="mt-1 text-sm font-bold text-gray-900">{formatRupiah(product.price)}</p>

        <p className="mt-auto pt-2 text-[11px] text-gray-500">
          {product.category}
          {!soldOut && available <= 5 && (
            <span className="text-red-600"> · sisa {available}</span>
          )}
        </p>
      </div>
    </Link>
  )
}
