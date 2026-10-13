'use client'

import { usePathname } from 'next/navigation'
import { TopBar } from '@/app/components/TopBar'
import { Header } from '@/app/components/Header'
import { CategoryNavigation } from '@/app/components/CategoryNavigation'

/**
 * Storefront shell (top bar + header + category nav — the best-sellers strip
 * lives inside the category nav row, beside the "all products" chip).
 *
 * The back office renders its own full-screen layout, so the shop chrome is
 * skipped there instead of being duplicated under it.
 */
export function StorefrontChrome() {
  const pathname = usePathname()
  if (pathname?.startsWith('/admin')) return null

  return (
    <>
      <TopBar />
      <Header />
      <CategoryNavigation />
    </>
  )
}
