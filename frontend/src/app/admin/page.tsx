'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import apiClient from '@/lib/api-client'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatDateTime,
  formatRupiah,
} from '@/lib/format'

interface Stats {
  orders: { total: number; byStatus: Record<string, number> }
  revenue: { collected: number; collectedOrders: number; today: number; refunded: number }
  products: { total: number; outOfStock: number; lowStock: number; inventoryValue: number }
  customers: { total: number }
  holds: { active: number; units: number; expiredPendingOrders: number }
  lowStock: Array<{ productId: string; name: string; stock: number; reserved: number; available: number }>
  recentOrders: Array<{
    id: string
    status: string
    totalPrice: number
    createdAt: string
    customer: string
    itemCount: number
  }>
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-900/10">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/stats')
      setStats(res.data)
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal memuat statistik')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <p className="text-sm text-neutral-500">Memuat ringkasan…</p>
  if (error) {
    return <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
  }
  if (!stats) return null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ringkasan</h1>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Muat ulang"
          title="Muat ulang"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-900 transition hover:bg-neutral-100"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Pendapatan terkumpul"
          value={formatRupiah(stats.revenue.collected)}
          hint={`dari ${stats.revenue.collectedOrders} pesanan dibayar`}
        />
        <StatCard label="Pendapatan hari ini" value={formatRupiah(stats.revenue.today)} />
        <StatCard
          label="Pesanan"
          value={String(stats.orders.total)}
          hint={`${stats.orders.byStatus.PENDING ?? 0} menunggu bayar`}
        />
        <StatCard
          label="Nilai stok"
          value={formatRupiah(stats.products.inventoryValue)}
          hint={`${stats.products.total} produk`}
        />
        <StatCard
          label="Stok menipis"
          value={String(stats.products.lowStock)}
          hint={`${stats.products.outOfStock} produk habis`}
        />
        <StatCard
          label="Unit tertahan"
          value={String(stats.holds.units)}
          hint={`${stats.holds.active} reservasi aktif`}
        />
        <StatCard
          label="Batal otomatis tertunda"
          value={String(stats.holds.expiredPendingOrders)}
          hint="pesanan lewat batas bayar"
        />
        <StatCard label="Pelanggan" value={String(stats.customers.total)} />
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
          <div className="flex items-center justify-between px-4 pb-4">
            <h2 className="font-semibold text-neutral-900">Pesanan terbaru</h2>
            <Link href="/admin/orders" className="text-sm text-neutral-900 hover:underline">
              Semua pesanan
            </Link>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">Belum ada pesanan.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {stats.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders?focus=${order.id}`}
                        className="font-mono text-xs text-neutral-900 hover:underline"
                      >
                        {order.id.slice(0, 8)}
                      </Link>
                      <p className="text-xs text-neutral-500">{order.customer}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {formatDateTime(order.createdAt)}
                      <p>{order.itemCount} item</p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatRupiah(order.totalPrice)}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex h-5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          ORDER_STATUS_STYLES[order.status] ?? 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
          <div className="flex items-center justify-between px-4 pb-4">
            <h2 className="font-semibold text-neutral-900">Stok menipis</h2>
            <Link href="/admin/inventory" className="text-sm text-neutral-900 hover:underline">
              Kelola stok
            </Link>
          </div>
          {stats.lowStock.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-500">Semua produk masih aman.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {stats.lowStock.map((row) => (
                  <tr key={row.productId} className="border-b last:border-0">
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-right text-xs text-neutral-500">
                      stok {row.stock} · tertahan {row.reserved}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-600">
                      {row.available} tersedia
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
