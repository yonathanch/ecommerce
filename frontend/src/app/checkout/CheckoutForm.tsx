'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import apiClient from '@/lib/api-client'
import { useCart } from '@/lib/cart-service'
import { startPayment, paymentErrorMessage } from '@/lib/payments'

interface Address {
  id: string
  label?: string | null
  recipient: string
  phone: string
  line1: string
  line2?: string | null
  city: string
  province?: string | null
  postalCode?: string | null
  country: string
  isDefault: boolean
}

const emptyAddress = {
  recipient: '',
  phone: '',
  line1: '',
  city: '',
  postalCode: '',
}

export function CheckoutForm({ onSuccess }: { onSuccess: () => void }) {
  const { items, subtotal, totalItems, loading, refresh } = useCart()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressId, setAddressId] = useState('')
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState(emptyAddress)

  const [couponInput, setCouponInput] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [discount, setDiscount] = useState(0)
  const [couponMessage, setCouponMessage] = useState('')

  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<any>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')

  const loadAddresses = useCallback(async () => {
    try {
      const res = await apiClient.get('/addresses')
      const list: Address[] = res.data ?? []
      setAddresses(list)
      setAddressId((current) => current || list.find((a) => a.isDefault)?.id || list[0]?.id || '')
    } catch {
      // Not signed in / offline — the checkout button stays disabled.
    }
  }, [])

  useEffect(() => {
    void loadAddresses()
  }, [loadAddresses])

  // A coupon is tied to a subtotal, so any cart change invalidates it.
  useEffect(() => {
    if (couponCode) {
      setCouponCode('')
      setDiscount(0)
      setCouponMessage('Cart changed — please apply the coupon again.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal])

  const applyCoupon = async () => {
    setCouponMessage('')
    setError('')
    if (!couponInput.trim()) return
    try {
      const res = await apiClient.post('/coupons/validate', {
        code: couponInput.trim(),
        subtotal,
      })
      setDiscount(res.data.discount)
      setCouponCode(res.data.coupon.code)
      setCouponMessage(`${res.data.coupon.code} applied — you save ${res.data.discount}`)
    } catch (e: any) {
      const message = e?.response?.data?.message
      setCouponMessage(Array.isArray(message) ? message.join(', ') : message ?? 'Invalid coupon')
      setCouponCode('')
      setDiscount(0)
    }
  }

  const removeCoupon = () => {
    setCouponCode('')
    setDiscount(0)
    setCouponMessage('')
    setCouponInput('')
  }

  const createAddress = async () => {
    setError('')
    try {
      const res = await apiClient.post('/addresses', newAddress)
      const created: Address = res.data
      setAddresses((prev) => [created, ...prev])
      setAddressId(created.id)
      setNewAddress(emptyAddress)
      setShowAddressForm(false)
    } catch (e: any) {
      const message = e?.response?.data?.message
      setError(Array.isArray(message) ? message.join(', ') : message ?? 'Could not save the address')
    }
  }

  const placeOrder = async () => {
    setPlacing(true)
    setError('')
    try {
      const res = await apiClient.post('/orders/checkout', {
        addressId,
        ...(couponCode ? { couponCode } : {}),
      })
      setOrder(res.data)
      await refresh()
      onSuccess()
    } catch (e: any) {
      const message = e?.response?.data?.message
      setError(Array.isArray(message) ? message.join(', ') : message ?? 'Checkout failed')
      await refresh()
    } finally {
      setPlacing(false)
    }
  }

  const total = Math.round((subtotal - discount) * 100) / 100
  const canPlace = Boolean(addressId) && items.length > 0 && !placing

  const payNow = async () => {
    if (!order) return
    setPaying(true)
    setPayError('')
    try {
      const payment = await startPayment(order.id)
      // Hand the customer over to the gateway (sandbox page in development).
      window.location.href = `${payment.paymentUrl}?amount=${payment.amount}&order=${order.id}`
    } catch (e) {
      setPayError(paymentErrorMessage(e))
      setPaying(false)
    }
  }

  if (order) {
    return (
      <div className="max-w-2xl mx-auto p-6 bg-green-50 border border-green-200 rounded">
        <h2 className="text-2xl font-bold text-green-800 mb-4">Order placed!</h2>
        <p className="text-green-700 mb-2">
          Order ID: <span className="font-mono font-bold">{order.id}</span>
        </p>
        <p className="text-green-700 mb-1">Status: {order.status}</p>
        <p className="text-green-700 mb-1">Subtotal: {order.subtotal}</p>
        {order.discount > 0 && (
          <p className="text-green-700 mb-1">
            Discount{order.couponCode ? ` (${order.couponCode})` : ''}: -{order.discount}
          </p>
        )}
        <p className="text-green-800 font-bold mb-4">Total: {order.totalPrice}</p>
        <p className="text-sm text-green-700 mb-4">
          Stok sudah ditahan untuk pesanan ini. Selesaikan pembayaran sebelum{' '}
          {order.expiresAt ? new Date(order.expiresAt).toLocaleString() : 'batas waktu berakhir'}.
        </p>

        {payError && (
          <p className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded text-sm">
            {payError}
          </p>
        )}

        <div className="flex flex-wrap gap-4">
          <button
            onClick={payNow}
            disabled={paying}
            className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {paying ? 'Mengalihkan…' : 'Bayar sekarang'}
          </button>
          <Link href="/orders" className="px-4 py-2 border border-green-300 rounded font-semibold text-green-800">
            View my orders
          </Link>
          <Link href="/products" className="px-4 py-2 border border-green-300 rounded font-semibold text-green-800">
            Keep shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Checkout</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>
      )}

      <div className="border rounded mb-6 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Shipping Address</h3>
          <button
            onClick={() => setShowAddressForm((v) => !v)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showAddressForm ? 'Cancel' : '+ New address'}
          </button>
        </div>

        {addresses.length === 0 && !showAddressForm && (
          <p className="text-gray-500 text-sm">No saved address yet — add one to continue.</p>
        )}

        {addresses.length > 0 && (
          <div className="space-y-2">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={`flex gap-3 items-start p-3 border rounded cursor-pointer ${
                  addressId === address.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <input
                  type="radio"
                  name="address"
                  checked={addressId === address.id}
                  onChange={() => setAddressId(address.id)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-semibold">{address.recipient}</span> · {address.phone}
                  <br />
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.city}{' '}
                  {address.postalCode ?? ''}, {address.country}
                  {address.isDefault && (
                    <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">default</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        )}

        {showAddressForm && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Recipient name"
              value={newAddress.recipient}
              onChange={(e) => setNewAddress({ ...newAddress, recipient: e.target.value })}
              className="p-2 border rounded"
            />
            <input
              placeholder="Phone"
              value={newAddress.phone}
              onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
              className="p-2 border rounded"
            />
            <input
              placeholder="Street address"
              value={newAddress.line1}
              onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
              className="p-2 border rounded sm:col-span-2"
            />
            <input
              placeholder="City"
              value={newAddress.city}
              onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
              className="p-2 border rounded"
            />
            <input
              placeholder="Postal code"
              value={newAddress.postalCode}
              onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
              className="p-2 border rounded"
            />
            <button
              onClick={createAddress}
              className="sm:col-span-2 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              Save address
            </button>
          </div>
        )}
      </div>

      <div className="border rounded mb-6 p-4">
        <h3 className="font-semibold mb-4">Order Summary</h3>
        {loading && items.length === 0 ? (
          <p className="text-gray-500">Loading your cart…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">
            Your cart is empty.{' '}
            <Link href="/products" className="text-blue-600 underline">
              Browse products
            </Link>
          </p>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div key={`${item.productId}:${item.variantSku ?? ''}`} className="flex justify-between">
                  <span>
                    {item.product?.name ?? item.productId}
                    {item.variant && (
                      <span className="text-gray-500">
                        {' '}({Object.values(item.variant.options ?? {}).join(', ')})
                      </span>
                    )}{' '}
                    ×{item.quantity}
                  </span>
                  <span className="font-semibold">{item.lineTotal}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between">
                <span>Subtotal ({totalItems} items)</span>
                <span className="font-semibold">{subtotal}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Discount {couponCode ? `(${couponCode})` : ''}</span>
                  <span className="font-semibold">-{discount}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{total}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                placeholder="Coupon code (try SUMMER20)"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                className="flex-1 p-2 border rounded"
              />
              <button
                onClick={applyCoupon}
                disabled={!couponInput.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded font-semibold disabled:bg-gray-400"
              >
                Apply
              </button>
              {couponCode && (
                <button onClick={removeCoupon} className="px-3 py-2 border rounded text-sm">
                  Remove
                </button>
              )}
            </div>
            {couponMessage && <p className="text-sm mt-2 text-gray-600">{couponMessage}</p>}
          </>
        )}
      </div>

      <button
        onClick={placeOrder}
        disabled={!canPlace}
        className={`w-full py-3 px-4 rounded font-semibold text-white ${
          canPlace ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
        }`}
      >
        {placing ? 'Placing order…' : 'Place Order'}
      </button>
    </div>
  )
}
