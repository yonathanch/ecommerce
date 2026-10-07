'use client'

import { useState, useEffect } from 'react'
import { CartModal } from './CartModal'
import { CartService } from '@/lib/cart-service'

const cartService = new CartService()

export function CartButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [itemCount, setItemCount] = useState(() => cartService.getCartSummary().totalItems)

  useEffect(() => {
    const handleCartChanged = () => setItemCount(cartService.getCartSummary().totalItems)
    window.addEventListener('cart-changed', handleCartChanged)
    return () => window.removeEventListener('cart-changed', handleCartChanged)
  }, [])

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Cart
        {itemCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
            {itemCount}
          </span>
        )}
      </button>
      <CartModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
