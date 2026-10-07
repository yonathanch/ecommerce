'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { CartButton } from '@/app/components/CartButton'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import axios from '@/lib/api-client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function Navbar() {
  const { token, user, logout } = useAuth()
  const router = useRouter()
  const [categories, setCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    axios.get('/products/categories').then((res) => setCategories(res.data)).catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <Link href="/" className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 shrink-0">
            MegaMart
          </Link>

          <div className="flex-1 max-w-lg hidden md:block">
            <Input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 bg-gray-50 border-gray-100 focus:border-blue-500 focus:ring-blue-500 transition-all rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {token ? (
              <>
                <Link href="/orders" className="hidden sm:block text-sm font-medium text-gray-600 hover:text-blue-600">Orders</Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}>Logout</Button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-blue-600">Sign In</Link>
                <Link href="/signup"><Button size="sm" className="bg-blue-600 hover:bg-blue-700 rounded-full">Sign Up</Button></Link>
              </>
            )}
            <CartButton />
          </div>
        </div>

        <div className="py-2 overflow-x-auto flex gap-2">
          <Link href="/products" className="px-4 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-blue-50 hover:text-blue-700 transition">All</Link>
          {categories.map((cat) => (
            <Link key={cat} href={`/products?category=${encodeURIComponent(cat)}`} className="px-4 py-1.5 rounded-full text-xs font-semibold bg-gray-100 hover:bg-blue-50 hover:text-blue-700 transition whitespace-nowrap">{cat}</Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
