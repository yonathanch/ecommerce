'use client'

import { useState, useEffect } from 'react'
import { CartService, CartItem } from '@/lib/cart-service'

const cartService = new CartService()

export function CartModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [items, setItems] = useState<CartItem[]>(() => cartService.getCart())

  useEffect(() => {
    const handleCartChanged = () => setItems(cartService.getCart())
    window.addEventListener('cart-changed', handleCartChanged)
    return () => window.removeEventListener('cart-changed', handleCartChanged)
  }, [])

  const updateQty = (id: string, qty: number) => {
    setItems(cartService.updateQuantity(id, qty))
    window.dispatchEvent(new CustomEvent('cart-changed'))
  }

  const remove = (id: string) => {
    setItems(cartService.removeFromCart(id))
    window.dispatchEvent(new CustomEvent('cart-changed'))
  }

  const { totalItems, totalPrice } = cartService.getCartSummary()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-md p-6 h-full shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Cart ({totalItems})</h2>
          <button onClick={onClose} className="p-2">Close</button>
        </div>

        {items.length === 0 ? (
          <p className="text-gray-500">Cart is empty</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.productId} className="flex justify-between items-center border-b pb-2">
                <div>
                  <p className="font-semibold">{item.productName}</p>
                  <p className="text-sm text-gray-500">${item.price.toFixed(2)} x {item.quantity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="px-2 bg-gray-100 rounded">-</button>
                  <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="px-2 bg-gray-100 rounded">+</button>
                  <button onClick={() => remove(item.productId)} className="text-red-500 ml-2">Remove</button>
                </div>
              </div>
            ))}
            <div className="text-xl font-bold pt-4">Total: ${totalPrice.toFixed(2)}</div>
            <a
              href="/checkout"
              className="block w-full bg-green-600 text-white py-3 rounded mt-4 text-center hover:bg-green-700"
            >
              Checkout
            </a>
          </div>
        )}
      </div>
    </div>
  )
}