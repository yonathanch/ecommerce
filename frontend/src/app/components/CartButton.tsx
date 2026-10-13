'use client'

import Link from 'next/link'
import { useLocale } from '@/app/providers/LocaleProvider'
import { useCart } from '@/lib/cart-service'
import { t, formatI18n } from '@/lib/i18n'
import { ShoppingCart } from 'lucide-react'

export function CartButton() {
  const locale = useLocale().locale
  const { totalItems } = useCart()

  const label = formatI18n(t('cart', 'cartCount', locale), { count: totalItems })

  return (
    <Link
      href="/checkout"
      className="relative flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition"
    >
      <span className="relative">
        <ShoppingCart className="w-[18px] h-[18px]" />
        {totalItems > 0 && (
          <span
            data-testid="cart-count"
            className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center font-semibold"
          >
            {totalItems}
          </span>
        )}
      </span>
      {label}
    </Link>
  )
}
