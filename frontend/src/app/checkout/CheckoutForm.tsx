'use client'

import { useState } from 'react'
import { CartService } from '@/lib/cart-service'
import axios from '@/lib/api-client'

const cartService = new CartService()

export function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orderCreated, setOrderCreated] = useState(false)
  const [orderId, setOrderId] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')

  const handleCheckout = async () => {
    setLoading(true)
    setError('')
    try {
      const cart = cartService.getCart()
      if (cart.length === 0) {
        setError('Cart is empty')
        return
      }

      const items = cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }))

      const res = await axios.post('/orders', { 
        items,
        shippingAddress: shippingAddress.trim() || 'No address provided'
      })
      setOrderId(res.data.id)
      setOrderCreated(true)
      cartService.clearCart()
      window.dispatchEvent(new CustomEvent('cart-changed'))
      onSuccess()
    } catch (e: any) {
      setError(e.response?.data?.message || 'Checkout failed')
    } finally {
      setLoading(false)
    }
  }

  const { totalPrice, items } = cartService.getCartSummary()

  if (orderCreated) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-green-50 border border-green-200 rounded">
        <h2 className="text-2xl font-bold text-green-800 mb-4">Order Created!</h2>
        <p className="text-green-700 mb-2">Order ID: <span className="font-mono font-bold">{orderId}</span></p>
        <p className="text-green-700">Status: Pending payment</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Checkout</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="border rounded mb-6 p-4">
        <h3 className="font-semibold mb-4">Shipping Address</h3>
        <textarea
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
          placeholder="Enter your shipping address..."
          className="w-full p-3 border rounded min-h-24"
          required
        />
      </div>

      <div className="border rounded mb-6 p-4">
        <h3 className="font-semibold mb-4">Order Summary</h3>
        {items.length === 0 ? (
          <p className="text-gray-500">Cart is empty</p>
        ) : (
          <div className="space-y-2 mb-4">
            {items.map((item) => (
              <div key={item.productId} className="flex justify-between">
                <span>{item.productName} x{item.quantity}</span>
                <span className="font-semibold">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>${totalPrice.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading || items.length === 0 || !shippingAddress.trim()}
        className={`w-full py-3 px-4 rounded font-semibold text-white ${
          loading || items.length === 0 || !shippingAddress.trim()
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {loading ? 'Processing...' : 'Place Order'}
      </button>
    </div>
  )
}
