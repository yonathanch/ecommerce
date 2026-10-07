'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import apiClient from '@/lib/api-client'
import { CartButton } from '@/app/components/CartButton'
import { useCart } from '@/lib/cart-service'

export default function ProductDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const { addToCart } = useCart()

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await apiClient.get(`/products/${id}`)
        setProduct(res.data)
      } catch (e) {
        console.error('Failed to fetch product:', e)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id])

  const handleAddToCart = () => {
    if (product && quantity > 0) {
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
      })
      alert(`Added ${quantity} to cart`)
      setQuantity(1)
    }
  }

  if (loading) return <p className="p-4">Loading...</p>
  if (!product) return <p className="p-4">Product not found</p>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="grid grid-cols-2 gap-8">
        <div className="bg-gray-200 h-96 flex items-center justify-center rounded">
          No Image
        </div>
        
        <div>
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <p className="text-gray-600 mb-4">{product.description}</p>
          
          <p className="text-2xl font-bold mb-2">${product.price.toFixed(2)}</p>
          <p className="text-gray-500 mb-4">Stock: {product.stock}</p>
          <p className="text-sm text-gray-400 mb-6">Category: {product.category}</p>
          
          <div className="flex gap-4 mb-6">
            <input 
              type="number" 
              min="1" 
              max={product.stock}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 p-2 border rounded"
            />
            <button 
              onClick={handleAddToCart}
              disabled={product.stock === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
