'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import apiClient from '@/lib/api-client'
import { useRouter } from 'next/navigation'

interface Order {
  id: string
  userId: string
  total: number
  status: string
  shippingAddress: string
  createdAt: string
  items: Array<{
    id: string
    productId: string
    productName: string
    quantity: number
    price: number
  }>
}

export default function OrdersPage() {
  const { token } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      router.push('/login')
      return
    }
    fetchOrders()
  }, [token])

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
                <p className="text-sm mb-2"><span className="font-medium">Shipping:</span> {order.shippingAddress}</p>
                <p className="text-lg font-bold">Total: ${order.total.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
