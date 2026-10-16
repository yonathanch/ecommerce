'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import apiClient from '@/lib/api-client'
import { Sheet } from '@/components/admin/overlay'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  formatDateTime,
  formatRupiah,
} from '@/lib/format'

interface CustomerRow {
  id: string
  email: string
  name: string | null
  createdAt: string
  ordersCount: number
  collectedOrders: number
  totalSpent: number
}

interface CustomerOrder {
  id: string
  status: string
  totalPrice: number
  createdAt: string
  itemCount: number
}

interface CustomerDetail {
  customer: { id: string; email: string; name: string | null; createdAt: string }
  summary: {
    ordersCount: number
    collectedOrders: number
    totalSpent: number
    cancelledOrders: number
    refundedOrders: number
    lastOrderAt: string | null
  }
  orders: CustomerOrder[]
}

/**
 * The counts in the detail panel come from the same COLLECTED set the list uses,
 * so opening a customer can never contradict the row that was clicked.
 */
function StatusPill({ status }: { status: string }) {
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

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [meta, setMeta] = useState<{ total: number; page: number; totalPages: number } | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (query) params.set('search', query)
      const res = await apiClient.get(`/admin/customers?${params.toString()}`)
      setCustomers(res.data.items)
      setMeta(res.data.meta)
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal memuat pelanggan')
    } finally {
      setLoading(false)
    }
  }, [page, query])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (customer: Pick<CustomerRow, 'id'>) => {
    setDetailLoading(true)
    setDetailError('')
    try {
      const res = await apiClient.get(`/admin/customers/${customer.id}`)
      setDetail(res.data)
    } catch (e: any) {
      setDetailError(e?.response?.data?.message ?? 'Gagal memuat detail pelanggan')
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetail(null)
    setDetailError('')
  }

  // The palette and the notification bell deep-link here with ?focus=<id>, the
  // same convention the Pesanan screen already uses. The id is enough: the
  // detail endpoint does not need the row that was clicked.
  const focusApplied = useRef(false)
  useEffect(() => {
    if (focusApplied.current) return
    const focus = new URLSearchParams(window.location.search).get('focus')
    if (!focus) return
    focusApplied.current = true
    void openDetail({ id: focus })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const detailTiles = detail
    ? [
        { label: 'Total pesanan', value: detail.summary.ordersCount },
        { label: 'Pesanan dibayar', value: detail.summary.collectedOrders },
        { label: 'Dibatalkan', value: detail.summary.cancelledOrders },
        { label: 'Direfund', value: detail.summary.refundedOrders },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pelanggan</h1>
        <p className="text-sm text-neutral-500">
          Total belanja hanya menghitung pesanan yang sudah dibayar (dikirim/diterima ikut
          dihitung, refund tidak).
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setQuery(search.trim())
        }}
        className="flex gap-3"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau email"
          className="w-72 h-9 rounded-lg border border-neutral-200 px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
        >
          Cari
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
              <th className="h-10 px-4 font-medium">Pelanggan</th>
              <th className="h-10 px-4 font-medium">Terdaftar</th>
              <th className="h-10 px-4 font-medium text-right">Pesanan</th>
              <th className="h-10 px-4 font-medium text-right">Dibayar</th>
              <th className="h-10 px-4 font-medium text-right">Total belanja</th>
              <th className="h-10 px-4" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Memuat…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Tidak ada pelanggan yang cocok.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr
                  key={customer.id}
                  className={`border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50 ${
                    detail?.customer.id === customer.id ? 'bg-neutral-100/70' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{customer.name ?? '-'}</p>
                    <p className="text-xs text-neutral-500">{customer.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {formatDateTime(customer.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">{customer.ordersCount}</td>
                  <td className="px-4 py-3 text-right">{customer.collectedOrders}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatRupiah(customer.totalSpent)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void openDetail(customer)}
                      className="h-8 rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-neutral-500">
            Halaman {meta.page} dari {meta.totalPages} · {meta.total} pelanggan
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 rounded-lg border border-neutral-200 px-3 text-sm disabled:opacity-40"
            >
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 rounded-lg border border-neutral-200 px-3 text-sm disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      <Sheet
        open={detailLoading || Boolean(detail)}
        onClose={closeDetail}
        title={detail ? detail.customer.name ?? 'Tanpa nama' : 'Detail pelanggan'}
        subtitle={
          detail ? (
            <span className="grid gap-0.5">
              <span>{detail.customer.email}</span>
              <span>
                Terdaftar {formatDateTime(detail.customer.createdAt)}
                {detail.summary.lastOrderAt
                  ? ` · pesanan terakhir ${formatDateTime(detail.summary.lastOrderAt)}`
                  : ' · belum pernah memesan'}
              </span>
            </span>
          ) : undefined
        }
        maxWidth="sm:max-w-xl lg:max-w-2xl"
      >
        {detailLoading ? (
          <div className="space-y-3" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-neutral-100" />
            ))}
            <p className="text-sm text-neutral-500">Memuat detail pelanggan…</p>
          </div>
        ) : detailError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {detailError}
          </p>
        ) : !detail ? null : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {detailTiles.map((tile) => (
              <div key={tile.label} className="rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-xs font-medium text-neutral-500">{tile.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-neutral-900">Total belanja terkumpul</span>
              <span className="text-lg font-semibold tabular-nums text-neutral-900">
                {formatRupiah(detail.summary.totalSpent)}
              </span>
            </p>

            <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-neutral-100/40 text-left text-xs font-medium text-neutral-500">
                    <th className="h-9 px-3 font-medium">Pesanan</th>
                    <th className="h-9 px-3 font-medium">Tanggal</th>
                    <th className="h-9 px-3 text-right font-medium">Item</th>
                    <th className="h-9 px-3 text-right font-medium">Total</th>
                    <th className="h-9 px-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                        Pelanggan ini belum punya pesanan.
                      </td>
                    </tr>
                  ) : (
                    detail.orders.map((order) => (
                      <tr key={order.id} className="border-b border-neutral-100 last:border-0">
                        <td className="px-3 py-2">
                          {/* The Pesanan screen opens a specific order via ?focus=<id>. */}
                          <Link
                            href={`/admin/orders?focus=${order.id}`}
                            className="font-mono text-xs text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
                          >
                            {order.id.slice(0, 12)}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-600">
                          {formatDateTime(order.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                          {order.itemCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                          {formatRupiah(order.totalPrice)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <StatusPill status={order.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {(detail.summary.ordersCount > detail.orders.length) && (
              <p className="text-xs text-neutral-500">
                Menampilkan {detail.orders.length} pesanan terbaru dari {detail.summary.ordersCount}.
              </p>
            )}
          </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
