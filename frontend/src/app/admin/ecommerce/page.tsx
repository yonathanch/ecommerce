'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { AreaChart, BarList, Panel, StatCard } from '@/components/admin/ui'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatDateTime,
  formatRupiah,
} from '@/lib/format'

interface Analytics {
  range: { from: string; to: string; months: number; kpiWindowDays: number }
  kpis: {
    grossSales: number
    orders: number
    averageOrderValue: number
    refunds: number
    previous: {
      grossSales: number
      orders: number
      averageOrderValue: number
      refunds: number
    }
  }
  monthly: { labels: string[]; revenue: number[]; refunds: number[]; orders: number[] }
  topProducts: Array<{ id: string; name: string; unitsSold: number; revenue: number }>
  salesByCategory: Array<{ name: string; units: number; revenue: number }>
  funnel: {
    stages: Array<{ key: string; label: string; count: number }>
    leak: { cancelled: number; refunded: number }
  }
}

/**
 * Percentage change against the previous window. Returns undefined when there is
 * nothing to compare against, so the card shows no pill instead of a fake
 * "+100%" off a zero baseline.
 */
function delta(current: number, previous: number): number | undefined {
  if (!previous) return undefined
  return ((current - previous) / previous) * 100
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)

/**
 * E-Commerce dashboard — same layout as the OrbynAdmin template, but every
 * figure is derived from paid orders via `/admin/analytics`.
 *
 * Two panels deliberately differ from the template, because matching it would
 * have meant inventing data:
 *
 * - the second chart series is refunds, not "profit", since the catalog stores
 *   no cost price. Refunds are their own series rather than subtracted from
 *   revenue, because a refunded order has already left the revenue series —
 *   subtracting it again would count the same money twice;
 * - the funnel is the order lifecycle, not a visitor/click funnel, because
 *   nothing in this system records visits or product views.
 */
export default function AdminEcommercePage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/admin/analytics')
      setData(res.data)
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal memuat analitik')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const windowLabel = data ? `${data.range.kpiWindowDays} hari terakhir` : '30 hari terakhir'
  const kpis = data?.kpis
  const funnel = data?.funnel
  const created = funnel?.stages.find((stage) => stage.key === 'created')?.count ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">E-Commerce</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Semua angka dihitung dari pesanan yang benar-benar dibayar (dikirim/diterima ikut
            dihitung, refund tidak).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Muat ulang"
            title="Muat ulang"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-900 transition hover:bg-neutral-100"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href="/admin/products?new=1"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
          >
            <Plus className="h-4 w-4" />
            Tambah produk
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}

      {loading && !data ? (
        <p className="rounded-xl bg-white p-6 text-sm text-neutral-500 ring-1 ring-neutral-900/10">
          Memuat analitik…
        </p>
      ) : null}

      {kpis && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Penjualan bruto"
            value={formatRupiah(kpis.grossSales)}
            delta={delta(kpis.grossSales, kpis.previous.grossSales)}
            caption={windowLabel}
          />
          <StatCard
            label="Pesanan dibayar"
            value={String(kpis.orders)}
            delta={delta(kpis.orders, kpis.previous.orders)}
            caption={windowLabel}
          />
          <StatCard
            label="Rata-rata nilai pesanan"
            value={formatRupiah(kpis.averageOrderValue)}
            delta={delta(kpis.averageOrderValue, kpis.previous.averageOrderValue)}
            caption={windowLabel}
          />
          <StatCard
            label="Refund"
            value={formatRupiah(kpis.refunds)}
            delta={delta(kpis.refunds, kpis.previous.refunds)}
            caption={windowLabel}
          />
        </div>
      )}

      {data && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel
            title="Pendapatan & Refund"
            subtitle={`Bulanan, ${data.range.months} bulan terakhir`}
            className="xl:col-span-2"
            action={
              <p className="max-w-[16rem] text-xs text-neutral-500">
                Tidak ada deret laba: katalog tidak menyimpan harga pokok, jadi laba hanya bisa
                dikarang. Refund digambar sebagai serinya sendiri, bukan dikurangkan dari
                pendapatan, karena pesanan yang direfund sudah keluar dari deret pendapatan.
              </p>
            }
          >
            <AreaChart
              labels={data.monthly.labels}
              series={[
                { name: 'Pendapatan', color: '#2563eb', values: data.monthly.revenue },
                { name: 'Refund', color: '#f59e0b', values: data.monthly.refunds },
              ]}
            />
          </Panel>

          <Panel title="Penjualan per Kategori" subtitle={`Pendapatan ${data.range.months} bulan terakhir`}>
            {data.salesByCategory.length === 0 ? (
              <p className="text-sm text-neutral-500">Belum ada penjualan.</p>
            ) : (
              <BarList
                items={data.salesByCategory.map((row) => ({ name: row.name, value: row.revenue }))}
              />
            )}
          </Panel>
        </div>
      )}

      {funnel && (
        <Panel
          title="Funnel status pesanan"
          subtitle={`${created} pesanan dibuat dalam ${data?.range.months ?? 12} bulan terakhir`}
        >
          <div className="space-y-3">
            {funnel.stages.map((stage, index) => {
              const share = pct(stage.count, created)
              const previous = index === 0 ? 100 : pct(funnel.stages[index - 1].count, created)
              return (
                <div key={stage.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-neutral-900">{stage.label}</span>
                    <span className="tabular-nums text-neutral-600">
                      {stage.count}
                      <span className="ml-2 text-xs text-neutral-500">{share.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded bg-neutral-100">
                    <div
                      className="h-full rounded bg-blue-600"
                      style={{ width: `${Math.max(share, stage.count > 0 ? 1 : 0)}%` }}
                    />
                  </div>
                  {index > 0 && previous > share && (
                    <p className="mt-1 text-xs text-neutral-500">
                      keluar di tahap ini: {Math.max(funnel.stages[index - 1].count - stage.count, 0)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Dihitung dari fakta, bukan status semata: &ldquo;Pembayaran masuk&rdquo; memakai{' '}
            <span className="font-mono">paidAt</span> sehingga pesanan yang kemudian direfund tetap
            terhitung pernah dibayar, dan &ldquo;Dikirim&rdquo; memakai{' '}
            <span className="font-mono">shippedAt</span>. Karena &ldquo;Diterima&rdquo; dibaca dari
            status, pesanan yang direfund setelah diterima keluar dari tahap itu — itulah sebabnya
            angkanya tidak berjumlah 100%.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Keluar dari alur: {funnel.leak.cancelled} dibatalkan · {funnel.leak.refunded} direfund.
            Kunjungan dan kunjungan halaman produk tidak digambarkan karena tidak ada yang
            mencatatnya.
          </p>
        </Panel>
      )}

      {data && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel
            title="Pesanan Terbaru"
            subtitle="5 pesanan terakhir masuk"
            className="xl:col-span-2"
            bodyClassName="px-0 pb-0"
            action={
              <Link href="/admin/orders" className="text-sm font-medium text-neutral-900 hover:underline">
                Lihat semua
              </Link>
            }
          >
            <RecentOrders />
          </Panel>

          <Panel title="Produk Teratas" subtitle="Berdasarkan unit terjual" bodyClassName="px-0 pb-0">
            {data.topProducts.length === 0 ? (
              <p className="px-4 text-sm text-neutral-500">Belum ada penjualan.</p>
            ) : (
              <ul>
                {data.topProducts.map((product, index) => (
                  <li
                    key={product.id}
                    className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${product.id}`}
                        className="block truncate text-sm font-medium text-neutral-900 hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="text-xs text-neutral-500">{product.unitsSold} terjual</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-neutral-900">
                      {formatRupiah(product.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

/**
 * Recent orders come from `/admin/orders`, the same endpoint the Pesanan screen
 * uses, so the dashboard can never disagree with the list it links to.
 */
function RecentOrders() {
  const [rows, setRows] = useState<
    Array<{
      id: string
      status: string
      totalPrice: number
      createdAt: string
      itemCount: number
      user: { email: string; name: string | null }
    }>
  >([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiClient
      .get('/admin/orders?limit=5&page=1')
      .then((res) => setRows(res.data.items))
      .catch((e: any) => setError(e?.response?.data?.message ?? 'Gagal memuat pesanan'))
  }, [])

  if (error) return <p className="px-4 text-sm text-rose-600">{error}</p>
  if (rows.length === 0) return <p className="px-4 text-sm text-neutral-500">Belum ada pesanan.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
            <th className="h-10 px-4 font-medium">Pesanan</th>
            <th className="h-10 px-4 font-medium">Pelanggan</th>
            <th className="h-10 px-4 font-medium">Tanggal</th>
            <th className="h-10 px-4 font-medium text-right">Total</th>
            <th className="h-10 px-4 font-medium text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => (
            <tr key={order.id} className="border-b border-neutral-100 last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/orders?focus=${order.id}`}
                  className="font-mono text-xs text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
                >
                  {order.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-3 text-neutral-700">
                {order.user?.name ?? order.user?.email ?? '-'}
                <span className="block text-xs text-neutral-400">{order.itemCount} item</span>
              </td>
              <td className="px-4 py-3 text-xs text-neutral-500">{formatDateTime(order.createdAt)}</td>
              <td className="px-4 py-3 text-right font-medium text-neutral-900">
                {formatRupiah(order.totalPrice)}
              </td>
              <td className="px-4 py-3 text-right">
                <OrderStatusPill status={order.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OrderStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        ORDER_STATUS_STYLES[status] ?? 'bg-neutral-500/10 text-neutral-600'
      }`}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  )
}
