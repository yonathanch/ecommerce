'use client'

import Link from 'next/link'

interface Product {
  id: string
  name: string
  description?: string
  price: number
  stock: number
  category: string
}

interface ProductCardProps {
  product: Product
  featured?: boolean
}

function getDiscount(name: string, price: number) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  const discountPct = 10 + Math.abs(hash % 31)
  const originalPrice = Number((price / (1 - discountPct / 100)).toFixed(2))
  return { originalPrice, discount: discountPct, savings: Number((originalPrice - price).toFixed(2)) }
}

const categoryImages: Record<string, string> = {
  Electronics: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop',
  Furniture: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop',
  Sports: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400&h=400&fit=crop',
  Accessories: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop',
  Home: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400&h=400&fit=crop',
  Appliances: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400&h=400&fit=crop',
}

const keywordImages: Array<[RegExp, string]> = [
  [/phone|galaxy|iphone|smartphone|mobile|redmi|pixel/i, 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop'],
  [/watch|band|wearable|smartwatch/i, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop'],
  [/speaker|headphone|earbud|audio|sound|boAt|buds/i, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop'],
  [/laptop|macbook|notebook|computer/i, 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=400&fit=crop'],
  [/chair|desk|table|sofa|furniture|shelf/i, 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=400&fit=crop'],
  [/backpack|bag|luggage|wallet/i, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=400&fit=crop'],
  [/bottle/i, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop'],
  [/tv|television|monitor|camera/i, 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&h=400&fit=crop'],
]

function resolveImage(product: Product) {
  for (const [re, url] of keywordImages) {
    if (re.test(product.name)) return url
  }
  return categoryImages[product.category] || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=400&fit=crop'
}

export function ProductCard({ product, featured = false }: ProductCardProps) {
  const { originalPrice, discount, savings } = getDiscount(product.name, product.price)

  const imageUrl = resolveImage(product)

  return (
    <Link
      href={`/products/${product.id}`}
      className={`block h-full rounded-lg bg-white overflow-hidden transition-all duration-300 group ${
        featured
          ? 'border-2 border-blue-500 shadow-[0_4px_20px_rgba(59,130,246,0.25)]'
          : 'border border-gray-200 hover:shadow-md hover:border-blue-300'
      }`}
    >
      <div className="relative bg-[#f4f5f7] h-40 sm:h-44 overflow-hidden">
        <img
          src={imageUrl}
          alt={product.name}
          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
        />
        <span className="absolute top-0 right-0 bg-blue-500 text-white text-[11px] font-bold leading-tight text-center px-2.5 py-2 rounded-bl-2xl rounded-tr-lg">
          56%
          <br />
          OFF
        </span>
      </div>

      <div className="p-3">
        <h3 className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 min-h-[36px]">
          {product.name}
        </h3>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-sm font-bold text-gray-900">₹{Math.round(product.price).toLocaleString('en-IN')}</span>
          <span className="text-xs line-through text-gray-400">₹{Math.round(originalPrice).toLocaleString('en-IN')}</span>
        </div>
        <div className="border-t border-gray-100 mt-2.5 pt-2 text-xs font-semibold text-green-600">
          Save - ₹{Math.round(savings).toLocaleString('en-IN')}
        </div>
      </div>
    </Link>
  )
}
