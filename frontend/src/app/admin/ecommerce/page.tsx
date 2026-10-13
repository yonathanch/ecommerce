'use client'

import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { AreaChart, BarList, Panel, StatCard, StatusPill } from '@/components/admin/ui'
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, formatRupiah } from '@/lib/format'
import {
  ecommerceKpis,
  recentOrders,
  revenueMonths,
  revenueSeries,
  salesByCategory,
  topProducts,
} from '@/lib/admin-mock'

/**
 * E-Commerce dashboard — layout ported from the OrbynAdmin template
 * (KPI cards → revenue chart + category breakdown → recent orders + top
 * products). Values come from the demo dataset in lib/admin-mock.ts; wiring it
 * to `/admin/stats` is a later step.
 */
export default function AdminEcommercePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">E-Commerce</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Pantau performa toko, penjualan, dan pemenuhan pesanan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            <Download className="h-4 w-4" />
            Ekspor
          </button>
          <Link
            href="/admin/products"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
          >
            <Plus className="h-4 w-4" />
            Tambah produk
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ecommerceKpis.map((kpi) => (
          <StatCard key={kpi.label} label={kpi.label} value={kpi.value} delta={kpi.delta} caption={kpi.caption} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Pendapatan & Laba"
          subtitle="Performa bulanan 12 bulan terakhir"
          className="xl:col-span-2"
        >
          <AreaChart labels={revenueMonths} series={revenueSeries} />
        </Panel>

        <Panel title="Penjualan per Kategori" subtitle="Kontribusi pendapatan bulan ini">
          <BarList items={salesByCategory} />
        </Panel>
      </div>

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
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-neutral-700">{order.id}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {order.customer}
                      <span className="block text-xs text-neutral-400">{order.items} item</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{order.date}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900">
                      {formatRupiah(order.total)}
                    </td>
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
          </div>
        </Panel>

        <Panel title="Produk Teratas" subtitle="Berdasarkan unit terjual" bodyClassName="px-0 pb-0">
          <ul>
            {topProducts.map((product, index) => (
              <li
                key={product.name}
                className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-0"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xs font-semibold text-neutral-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{product.name}</p>
                  <p className="text-xs text-neutral-500">{product.sold} terjual</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-neutral-900">
                  {formatRupiah(product.revenue)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Ringkasan Pemenuhan" subtitle="Status pengiriman bulan ini">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone="blue">Dalam perjalanan 42</StatusPill>
          <StatusPill tone="amber">Menunggu pickup 8</StatusPill>
          <StatusPill tone="green">Terkirim 388</StatusPill>
          <StatusPill tone="rose">Gagal kirim 3</StatusPill>
        </div>
      </Panel>
    </div>
  )
}
