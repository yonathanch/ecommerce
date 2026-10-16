'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BadgePercent,
  Boxes,
  CornerDownLeft,
  LayoutDashboard,
  Package,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Truck,
  Users,
} from 'lucide-react'
import apiClient from '@/lib/api-client'
import { ORDER_STATUS_LABELS, formatRupiah } from '@/lib/format'

/**
 * Ctrl+K palette.
 *
 * One request answers the whole query: `/admin/search` returns the three things
 * an admin types (a product, an order id, a customer) grouped, and every row
 * carries the id needed to land on the screen that owns it. With an empty box it
 * shows plain links to the back-office screens — navigation, not fake results.
 */

interface SearchHit {
  key: string
  group: 'Produk' | 'Pesanan' | 'Pelanggan' | 'Halaman'
  label: string
  hint: string
  href: string
  icon: typeof Package
}

interface ProductHit {
  id: string
  name: string
  price: number
  stock: number
  category: string
  matchedSkus: string[]
}

interface OrderHit {
  id: string
  status: string
  totalPrice: number
  createdAt: string
  user: { email: string; name: string | null } | null
}

interface CustomerHit {
  id: string
  email: string
  name: string | null
  createdAt: string
}

/** Destinations, so an empty query still leads somewhere real. */
const SHORTCUTS: { label: string; href: string; icon: typeof Package }[] = [
  { label: 'Ringkasan', href: '/admin', icon: LayoutDashboard },
  { label: 'E-Commerce', href: '/admin/ecommerce', icon: ShoppingBag },
  { label: 'Produk', href: '/admin/products', icon: Package },
  { label: 'Pesanan', href: '/admin/orders', icon: ShoppingCart },
  { label: 'Pelanggan', href: '/admin/customers', icon: Users },
  { label: 'Inventori', href: '/admin/inventory', icon: Boxes },
  { label: 'Diskon', href: '/admin/discounts', icon: BadgePercent },
  { label: 'Pengiriman', href: '/admin/shipping', icon: Truck },
  { label: 'Ulasan', href: '/admin/reviews', icon: Star },
]

const MIN_QUERY = 2

export function CommandPalette({
  open,
  onOpenChange,
}: {
  /** Controlled by the shell so the header button can open the same palette. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<ProductHit[]>([])
  const [orders, setOrders] = useState<OrderHit[]>([])
  const [customers, setCustomers] = useState<CustomerHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)

  const close = useCallback(() => {
    onOpenChange(false)
    setQuery('')
    setActive(0)
    setError('')
  }, [onOpenChange])

  // Ctrl+K / ⌘K anywhere in the shell, and Escape to leave.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
        return
      }
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  // Every open starts clean, whichever way it was opened: the header button and
  // Ctrl+K must behave identically, and a leftover query would show results for
  // text nobody is typing any more (Escape closes without clearing).
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setError('')
    input.current?.focus()
  }, [open])

  // Debounced so a fast typist costs one request, not one per keystroke.
  useEffect(() => {
    const text = query.trim()
    if (!open || text.length < MIN_QUERY) {
      setProducts([])
      setOrders([])
      setCustomers([])
      setLoading(false)
      setError('')
      return
    }

    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get('/admin/search', { params: { q: text, limit: 5 } })
        if (cancelled) return
        setProducts(res.data?.products ?? [])
        setOrders(res.data?.orders ?? [])
        setCustomers(res.data?.customers ?? [])
        setError('')
      } catch (e: any) {
        if (cancelled) return
        setError(e?.response?.data?.message ?? 'Pencarian gagal')
        setProducts([])
        setOrders([])
        setCustomers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  const hits = useMemo<SearchHit[]>(() => {
    if (query.trim().length < MIN_QUERY) {
      return SHORTCUTS.map((item) => ({
        key: `page:${item.href}`,
        group: 'Halaman' as const,
        label: item.label,
        hint: item.href,
        href: item.href,
        icon: item.icon,
      }))
    }

    return [
      ...products.map((product) => ({
        key: `product:${product.id}`,
        group: 'Produk' as const,
        label: product.name,
        hint: `Stok ${product.stock} · ${formatRupiah(product.price)} · ${product.category}${
          product.matchedSkus.length > 0 ? ` · SKU ${product.matchedSkus.join(', ')}` : ''
        }`,
        href: `/admin/products?focus=${product.id}`,
        icon: Package,
      })),
      ...orders.map((order) => ({
        key: `order:${order.id}`,
        group: 'Pesanan' as const,
        label: `Pesanan ${order.id.slice(0, 8)}`,
        hint: `${ORDER_STATUS_LABELS[order.status] ?? order.status} · ${formatRupiah(
          order.totalPrice,
        )} · ${order.user?.email ?? 'pelanggan tidak diketahui'}`,
        href: `/admin/orders?focus=${order.id}`,
        icon: ShoppingCart,
      })),
      ...customers.map((customer) => ({
        key: `customer:${customer.id}`,
        group: 'Pelanggan' as const,
        label: customer.name ?? customer.email,
        hint: customer.name ? customer.email : 'Pelanggan',
        href: `/admin/customers?focus=${customer.id}`,
        icon: Users,
      })),
    ]
  }, [query, products, orders, customers])

  // A new result set starts from the top row, never on a stale index.
  useEffect(() => {
    setActive(0)
  }, [hits.length, query])

  const go = (hit: SearchHit) => {
    close()
    router.push(hit.href)
  }

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (hits.length === 0 ? 0 : (i + 1) % hits.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (hits.length === 0 ? 0 : (i - 1 + hits.length) % hits.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      if (hit) go(hit)
    }
  }

  const grouped = useMemo(() => {
    const order: SearchHit['group'][] = ['Produk', 'Pesanan', 'Pelanggan', 'Halaman']
    return order
      .map((group) => ({ group, rows: hits.filter((hit) => hit.group === group) }))
      .filter((section) => section.rows.length > 0)
  }, [hits])

  if (!open) return null

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_QUERY

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 p-4 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian cepat"
        className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-neutral-900/10"
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-4">
          <Search className="size-4 shrink-0 text-neutral-400" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder="Cari produk, pesanan, atau pelanggan…"
            aria-label="Cari produk, pesanan, atau pelanggan"
            aria-controls="command-palette-results"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
          />
          {loading && <span className="shrink-0 text-xs text-neutral-400">Mencari…</span>}
        </div>

        <div id="command-palette-results" role="listbox" className="max-h-[22rem] overflow-y-auto">
          {error ? (
            <p className="px-4 py-6 text-center text-sm text-rose-600">{error}</p>
          ) : tooShort ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              Ketik minimal {MIN_QUERY} huruf untuk mencari.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              {loading ? 'Mencari…' : `Tidak ada hasil untuk “${query.trim()}”.`}
            </p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="py-1">
                <p className="px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  {section.group}
                </p>
                <ul>
                  {section.rows.map((hit) => {
                    const index = hits.indexOf(hit)
                    const Icon = hit.icon
                    return (
                      <li key={hit.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === active}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(hit)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${
                            index === active ? 'bg-neutral-100' : ''
                          }`}
                        >
                          <Icon className="size-4 shrink-0 text-neutral-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-neutral-900">
                              {hit.label}
                            </span>
                            <span className="block truncate text-xs text-neutral-500">
                              {hit.hint}
                            </span>
                          </span>
                          {index === active && (
                            <CornerDownLeft className="size-3.5 shrink-0 text-neutral-400" />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-100 px-4 py-2 text-[11px] text-neutral-500">
          <span>↑↓ pilih</span>
          <span>↵ buka</span>
          <span>Esc tutup</span>
        </div>
      </div>
    </div>
  )
}
