'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BadgePercent,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Package,
  PanelLeft,
  Search,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Tag,
  Truck,
  Users,
  User,
  Settings,
  CreditCard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { NotificationBell } from '@/components/admin/NotificationBell'
import { CommandPalette } from '@/components/admin/CommandPalette'

/**
 * Admin shell.
 *
 * Layout follows the OrbynAdmin template: a flat, full-height sidebar column
 * (16rem, `--sidebar` background, right border) beside a white content column
 * with a sticky h-16 header bar and a padded <main>. No floating cards — the
 * template keeps the shell flat and lets each screen own its own cards.
 *
 * Auth enforcement stays exactly as before — this file only owns presentation.
 */
interface NavChild {
  href: string
  label: string
}

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Nested menu entries, shown when the parent is expanded (template style). */
  children?: NavChild[]
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Dashboard',
    items: [
      { href: '/admin', label: 'Ringkasan', icon: LayoutDashboard },
      { href: '/admin/ecommerce', label: 'E-Commerce', icon: ShoppingBag },
    ],
  },
  {
    label: 'E-Commerce',
    items: [
      {
        href: '/admin/products',
        label: 'Produk',
        icon: Package,
        children: [
          { href: '/admin/products', label: 'Semua Produk' },
          { href: '/products', label: 'Storefront' },
          { href: '/admin/products?new=1', label: 'Tambah Produk' },
        ],
      },
      {
        href: '/admin/orders',
        label: 'Pesanan',
        icon: ShoppingCart,
        children: [
          { href: '/admin/orders', label: 'Semua Pesanan' },
          { href: '/admin/orders?new=1', label: 'Buat Pesanan' },
        ],
      },
      {
        href: '/admin/customers',
        label: 'Pelanggan',
        icon: Users,
        children: [
          { href: '/admin/customers', label: 'Semua Pelanggan' },
          { href: '/admin/customers?new=1', label: 'Tambah Pelanggan' },
        ],
      },
      { href: '/admin/categories', label: 'Kategori', icon: LayoutGrid },
      { href: '/admin/brands', label: 'Brand', icon: Tag },
      { href: '/admin/inventory', label: 'Inventori', icon: Boxes },
      { href: '/admin/discounts', label: 'Diskon', icon: BadgePercent },
      { href: '/admin/shipping', label: 'Pengiriman', icon: Truck },
      { href: '/admin/reviews', label: 'Ulasan', icon: Star },
    ],
  },
]

/** Every destination, including submenu entries — used for breadcrumbs. */
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) =>
  group.items.flatMap((item) => [item, ...(item.children ?? [])]),
)

/** Mobile strip stays on top-level destinations so it does not get crowded. */
const MOBILE_NAV = NAV_GROUPS.flatMap((group) => group.items)

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  // Submenu state must be declared with the other hooks, before any early
  // return, otherwise the hook order changes between renders.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!token) {
      router.replace('/login')
      return
    }
    // The API enforces this too; the redirect just avoids an empty shell.
    if (user?.role !== 'ADMIN') router.replace('/')
  }, [isLoading, token, user, router])

  if (isLoading) {
    return <p className="p-8 text-sm text-neutral-500">Memuat…</p>
  }

  if (!token || user?.role !== 'ADMIN') {
    return (
      <div className="p-8">
        <p className="text-sm text-neutral-600">
          Halaman ini hanya untuk admin. Anda akan diarahkan ke halaman lain…
        </p>
      </div>
    )
  }

  const current = ALL_NAV_ITEMS.find((item) => isActive(pathname, item.href))
  const name = user?.email?.split('@')[0] ?? 'Admin'
  // A submenu is open by default while one of its links is the current page;
  // the toggle above overrides that per parent href.
  const childActive = (item: NavItem) =>
    (item.children ?? []).some((child) => child.href.split('?')[0] === pathname)

  const signOut = () => {
    logout()
    router.replace('/login')
  }

  const openPalette = () => setPaletteOpen(true)

  return (
    <div className="admin-theme flex min-h-screen w-full bg-white text-neutral-900">
      {/* ---------------------------------------------------------- sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {/* Workspace switcher — SidebarHeader + SidebarMenuButton size="lg". */}
          <div className="flex flex-col gap-2 p-2">
            <div className="flex h-12 items-center gap-2 rounded-md px-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
                <Store className="size-5" />
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold tracking-tight">OUTFITX</span>
                <span className="truncate text-xs text-neutral-500">Admin</span>
              </span>
            </div>
          </div>

          {/* Navigation groups — SidebarGroup (p-2) + SidebarGroupLabel (h-8). */}
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="relative flex w-full min-w-0 flex-col p-2">
              <div className="flex h-8 shrink-0 items-center px-2 text-xs font-medium text-neutral-900/70">
                {group.label}
              </div>

              <ul className="flex w-full min-w-0 flex-col">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href)
                  const Icon = item.icon
                  const hasChildren = Boolean(item.children?.length)
                  const open = toggled[item.href] ?? (active || childActive(item))

                  return (
                    <li key={item.href} className="group/menu-item relative">
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={() =>
                            setToggled((prev) => ({ ...prev, [item.href]: !open }))
                          }
                          className={`flex h-8 w-full items-center gap-2 rounded-md p-2 text-sm transition ${
                            active
                              ? 'bg-neutral-100 font-medium text-neutral-900'
                              : 'text-neutral-900 hover:bg-neutral-100'
                          }`}
                        >
                          <Icon className="size-4 shrink-0 text-neutral-900/70" />
                          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                          <ChevronRight
                            className={`ml-auto size-4 shrink-0 text-neutral-500 transition-transform duration-200 ${
                              open ? 'rotate-90' : ''
                            }`}
                          />
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          className={`flex h-8 items-center gap-2 rounded-md p-2 text-sm transition ${
                            active
                              ? 'bg-neutral-100 font-medium text-neutral-900'
                              : 'text-neutral-900 hover:bg-neutral-100'
                          }`}
                        >
                          <Icon className="size-4 shrink-0 text-neutral-900/70" />
                          <span className="min-w-0 truncate">{item.label}</span>
                        </Link>
                      )}

                      {hasChildren && open && (
                        <ul className="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-neutral-200 px-2.5 py-0.5">
                          {item.children!.map((child) => {
                            const isChildCurrent =
                              !child.href.includes('?') && child.href === pathname
                            return (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  className={`flex h-7 min-w-0 -translate-x-px items-center overflow-hidden rounded-md px-2 text-sm transition ${
                                    isChildCurrent
                                      ? 'bg-neutral-100 text-neutral-900'
                                      : 'text-neutral-900 hover:bg-neutral-100'
                                  }`}
                                >
                                  <span className="truncate">{child.label}</span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* SidebarFooter — SidebarMenuButton size="lg", no card wrapper. */}
        <div className="flex shrink-0 flex-col gap-1 p-2">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-sm font-medium text-neutral-700">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-neutral-500">{user?.email}</span>
            </span>
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              <Store className="size-4" />
              Toko
            </Link>
            <button
              type="button"
              onClick={signOut}
              aria-label="Keluar"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-900 transition hover:bg-neutral-100"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------- content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/60 md:px-6">
          <Button variant="ghost" size="icon-sm" className="-ml-1 hidden md:flex">
            <PanelLeft className="size-4" />
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
          <div className="mr-1 hidden h-5 w-px shrink-0 self-center bg-neutral-200 md:block" />
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-neutral-500 sm:inline">Dashboard</span>
            <span className="hidden text-neutral-300 sm:inline">/</span>
            <span className="truncate font-medium text-neutral-900">
              {current?.label ?? 'Ringkasan'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Both open the same palette: a click for the mouse, Ctrl+K for
                the keyboard. The Ctrl+K listener lives in the palette itself. */}
            <Button
              variant="outline"
              onClick={openPalette}
              className="hidden h-9 w-56 justify-start gap-2 px-3 text-neutral-500 md:flex"
            >
              <Search className="size-4" />
              <span className="text-sm">Cari…</span>
              <KbdGroup className="ml-auto">
                <Kbd>Ctrl</Kbd>
                <span className="text-[11px] font-medium text-neutral-500">+</span>
                <Kbd>K</Kbd>
              </KbdGroup>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={openPalette}
              aria-label="Cari"
              className="relative rounded-full md:hidden"
            >
              <Search className="size-5" />
            </Button>

            <NotificationBell />

            <Button variant="ghost" className="h-9 gap-2 px-1.5">
              <Avatar className="size-7">
                <AvatarFallback className="rounded-lg bg-neutral-200 text-sm font-medium text-neutral-700">
                  {name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium lg:inline">{name}</span>
            </Button>

            <Link
              href="/"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 md:hidden"
            >
              <Store className="size-4" />
              Toko
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 md:hidden"
            >
              <LogOut className="size-4" />
              Keluar
            </button>
          </div>
        </header>

        {/* Horizontal tab strip on phones/tablets, real sidebar from md up. */}
        <nav className="no-scrollbar overflow-x-auto border-b border-neutral-200 px-4 py-2 md:hidden">
          <ul className="flex gap-1.5">
            {MOBILE_NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    className={`block h-8 whitespace-nowrap rounded-lg px-3 text-sm font-medium leading-8 transition ${
                      active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
