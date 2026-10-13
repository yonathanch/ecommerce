'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import apiClient from '@/lib/api-client'
import { startPayment, paymentErrorMessage } from '@/lib/payments'
import { useRouter } from 'next/navigation'

const formatAmount = (value: number | undefined) =>
  typeof value === 'number' ? value.toFixed(2) : '0.00'

// Older orders used `total`; checkout orders carry subtotal/discount/totalPrice.
const totalOf = (order: any) => order.totalPrice ?? order.total ?? 0

// The address is a snapshot object on checkout orders, a plain string on legacy ones.
function shippingLine(address: any): string {
  if (!address) return ''
  if (typeof address === 'string') return address
  return [address.recipient, address.line1, address.city, address.postalCode]
    .filter(Boolean)
    .join(', ')
}

interface Order {
  id: string
  userId: string
  total?: number
  totalPrice?: number
  discount?: number
  couponCode?: string | null
  status: string
  shippingAddress: any
  createdAt: string
  expiresAt?: string | null
  payments?: Array<{ id: string; status: string; provider: string; amount: number }>
  items: Array<{
    id: string
    productId: string
    productName: string
    quantity: number
    price: number
  }>
}

export default function OrdersPage() {
  const { token, isLoading } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busyOrder, setBusyOrder] = useState('')
  const [actionError, setActionError] = useState('')

  const payOrder = async (orderId: string) => {
    setBusyOrder(orderId)
    setActionError('')
    try {
      const payment = await startPayment(orderId)
      window.location.href = `${payment.paymentUrl}?amount=${payment.amount}&order=${orderId}`
    } catch (e) {
      setActionError(paymentErrorMessage(e))
      setBusyOrder('')
    }
  }

  const cancelOrder = async (orderId: string) => {
    setBusyOrder(orderId)
    setActionError('')
    try {
      await apiClient.post(`/orders/${orderId}/cancel`)
      await fetchOrders()
    } catch (e: any) {
      const message = e?.response?.data?.message
      setActionError(Array.isArray(message) ? message.join(', ') : message ?? 'Gagal membatalkan pesanan')
    } finally {
      setBusyOrder('')
    }
  }

  useEffect(() => {
    // AuthProvider hydrates the token from localStorage after mount, so wait for
    // it before deciding the visitor is signed out.
    if (isLoading) return
    if (!token) {
      router.push('/login')
      return
    }
    void fetchOrders()
  }, [token, isLoading])

  const fetchOrders = async () => {
    try {
      const res = await apiClient.get('/orders')
      setOrders(res.data)
    } catch (e) {
      console.error('Failed to load orders:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p className="p-4">Loading orders...</p>

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">My Orders</h1>

      {actionError && (
        <p className="mb-6 p-3 bg-red-100 border border-red-300 text-red-700 rounded text-sm">
          {actionError}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="text-gray-500">No orders yet</p>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="border rounded-lg p-6 shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-semibold">Order #{order.id.slice(0, 8)}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded text-sm font-medium ${
                  order.status === 'PAID' ? 'bg-green-100 text-green-800' :
                  order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                  order.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {order.status}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Items:</p>
                <ul className="space-y-1">
                  {order.items.map((item) => (
                    <li key={item.id} className="text-sm text-gray-700">
                      {item.productName} × {item.quantity} - ${(item.price * item.quantity).toFixed(2)}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t pt-4">
                {shippingLine(order.shippingAddress) && (
                  <p className="text-sm mb-2">
                    <span className="font-medium">Shipping:</span> {shippingLine(order.shippingAddress)}
                  </p>
                )}
                {(order.discount ?? 0) > 0 && (
                  <p className="text-sm mb-2 text-green-700">
                    Discount{order.couponCode ? ` (${order.couponCode})` : ''}: -{formatAmount(order.discount)}
                  </p>
                )}
                <p className="text-lg font-bold">Total: {formatAmount(totalOf(order))}</p>

                {order.status === 'PENDING' && order.expiresAt && (
                  <p className="text-xs text-gray-500 mt-2">
                    Bayar sebelum {new Date(order.expiresAt).toLocaleString()} — stok ditahan sampai waktu itu.
                  </p>
                )}

                {order.status === 'PENDING' && (
                  <div className="flex flex-wrap gap-3 mt-4">
                    <button
                      onClick={() => payOrder(order.id)}
                      disabled={busyOrder === order.id}
                      className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {busyOrder === order.id ? 'Memproses…' : 'Bayar sekarang'}
                    </button>
                    <button
                      onClick={() => cancelOrder(order.id)}
                      disabled={busyOrder === order.id}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded font-semibold hover:bg-red-50 disabled:text-gray-400"
                    >
                      Batalkan pesanan
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
