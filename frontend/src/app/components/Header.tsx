'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { CartButton } from '@/app/components/CartButton'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search, User, Menu, X, LogOut, LayoutDashboard, Package, Shirt } from 'lucide-react'
import { useLocale } from '@/app/providers/LocaleProvider'
import { t } from '@/lib/i18n'

interface DrawerLink {
  href: string
  labelKey: 'categories.allProducts' | 'orders.myOrders'
  icon: typeof Shirt
}

const DRAWER_LINKS: DrawerLink[] = [
  { href: '/products', labelKey: 'categories.allProducts', icon: Shirt },
  { href: '/orders', labelKey: 'orders.myOrders', icon: Package },
]

export function Header() {
  const { token, user, logout } = useAuth()
  const { locale } = useLocale()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    setMenuOpen(false)
    logout()
    router.push('/')
  }

  const submitSearch = () => {
    const query = search.trim()
    router.push(query ? `/products?search=${encodeURIComponent(query)}` : '/products')
  }

  // Close the drawer when the viewport grows past the breakpoint where it is
  // reachable, otherwise it stays mounted but invisible.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:gap-4">
        {/* Kiri: hamburger (mobile saja) + logo */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('header', 'menuOpen', locale)}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition hover:bg-blue-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="text-xl font-bold tracking-tight text-blue-600 sm:text-2xl">
            OUTFITX
          </Link>
        </div>

        {/* Tengah: search (desktop) */}
        <div className="hidden h-10 max-w-xl flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 transition focus-within:border-blue-400 sm:flex">
          <Search className="h-4 w-4 shrink-0 text-blue-500" />
          <input
            type="text"
            placeholder={t('header', 'searchPlaceholder', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch()
            }}
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={submitSearch}
            aria-label={t('header', 'searchPlaceholder', locale)}
            className="shrink-0 text-blue-500 transition hover:text-blue-600"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Kanan: akun + cart */}
        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-5">

          {token ? (
            <>
              {user?.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-700 transition hover:text-blue-600"
                >
                  <LayoutDashboard className="h-[18px] w-[18px]" />
                  <span className="hidden md:inline">{t('header', 'admin', locale)}</span>
                </Link>
              )}
              <Link
                href="/orders"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 transition hover:text-blue-600"
              >
                <User className="h-[18px] w-[18px]" />
                <span className="hidden md:inline">{t('header', 'orders', locale)}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 transition hover:text-red-600"
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span className="hidden md:inline">{t('header', 'signOut', locale)}</span>
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 transition hover:text-blue-600"
            >
              <User className="h-[18px] w-[18px] text-gray-700" />
              <span className="hidden sm:inline">{t('header', 'signIn', locale)}</span>
            </Link>
          )}
          <CartButton />
        </div>
      </div>

      {/* Baris search khusus ponsel */}
      <div className="border-t border-gray-100 px-4 py-2 sm:hidden">
        <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 focus-within:border-blue-400">
          <Search className="h-4 w-4 shrink-0 text-blue-500" />
          <input
            type="text"
            placeholder={t('header', 'searchPlaceholder', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch()
            }}
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label={t('header', 'menuClose', locale)}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80%] flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
              <span className="text-lg font-bold text-blue-600">OUTFITX</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('header', 'menuClose', locale)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              {DRAWER_LINKS.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Icon className="h-[18px] w-[18px] text-blue-500" />
                    {t('header', link.labelKey, locale)}
                  </Link>
                )
              })}
              {user?.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-blue-50 hover:text-blue-600"
                >
                  <LayoutDashboard className="h-[18px] w-[18px] text-blue-500" />
                  {t('admin', 'dashboard', locale)}
                </Link>
              )}
            </nav>

            <div className="border-t border-gray-100 p-2">
              {token ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="h-[18px] w-[18px] text-red-500" />
                  {t('header', 'signOut', locale)}
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-blue-50 hover:text-blue-600"
                >
                  <User className="h-[18px] w-[18px] text-blue-500" />
                  {t('header', 'signIn', locale)}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
