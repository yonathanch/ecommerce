'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { CartButton } from '@/app/components/CartButton'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search, User, Menu, List, LogOut } from 'lucide-react'

export function Header() {
  const { token, logout } = useAuth()
  const router = useRouter()
  const [search, setSearch] = useState('')

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  return (
    <header className="bg-white sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center gap-4">
        {/* Kiri: hamburger + logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button className="w-9 h-9 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center transition">
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/" className="text-2xl font-bold text-blue-600 tracking-tight">
            MegaMart
          </Link>
        </div>

        {/* Tengah: search */}
        <div className="flex-1 max-w-xl hidden sm:flex items-center h-10 bg-white border border-gray-200 rounded-lg px-3 gap-2 focus-within:border-blue-400 transition">
          <Search className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            type="text"
            placeholder="Search essentials, groceries and more..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') router.push('/products')
            }}
            className="flex-1 h-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <button className="text-blue-500 hover:text-blue-600 shrink-0" aria-label="List view">
            <List className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Kanan: akun + cart */}
        <div className="flex items-center gap-5 shrink-0 ml-auto">
          {token ? (
            <>
              <Link href="/orders" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition">
                <User className="w-[18px] h-[18px]" />
                <span className="hidden md:inline">My Orders</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-red-600 transition"
              >
                <LogOut className="w-[18px] h-[18px]" />
                <span className="hidden md:inline">Logout</span>
              </button>
            </>
          ) : (
            <Link href="/login" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 transition">
              <User className="w-[18px] h-[18px] text-gray-700" />
              Sign Up/Sign In
            </Link>
          )}
          <CartButton />
        </div>
      </div>
    </header>
  )
}
