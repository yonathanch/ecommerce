'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart-service'
import { ShoppingCart } from 'lucide-react'

export function CartButton() {
  const { items } = useCart()
  const count = items.reduce((acc, item) => acc + item.quantity, 0)

  return (
    <Link href="/checkout" className="relative flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition">
      <span className="relative">
        <ShoppingCart className="w-[18px] h-[18px]" />
        {count > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center font-semibold">
            {count}
          </span>
        )}
      </span>
      Cart
    </Link>
  )
}
