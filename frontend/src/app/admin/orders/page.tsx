'use client'

import { useCallback, useEffect, useState } from 'react'
import apiClient from '@/lib/api-client'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  TRANSITION_LABELS,
  formatDateTime,
  formatRupiah,
} from '@/lib/format'

const STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']

interface AdminOrder {
  id: string
  status: string
  totalPrice: number
  subtotal: number
  discount: number
  couponCode: string | null
  createdAt: string
  expiresAt: string | null
  shippingAddress: any
  user: { id: string; email: string; name: string | null }
  items: Array<{ id: string; productName: string; quantity: number; price: number; variantSku: string | null }>
  payments: Array<{ id: string; status: string; provider: string; amount: number; createdAt: string }>
  allowedTransitions?: string[]
  reservations?: Array<{ productId: string; quantity: number; status: string }>
}

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [meta, setMeta] = useState<{ total: number; page: number; totalPages: number } | null>(null)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<AdminOrder | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' })
      if (status) params.set('status', status)
      if (query) params.set('search', query)
      const res = await apiClient.get(`/admin/orders?${params.toString()}`)
      setOrders(res.data.items)
      setMeta(res.data.meta)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat pesanan'))
    } finally {
      setLoading(false)
    }
  }, [page, status, query])

  const openDetail = useCallback(async (id: string) => {
    try {
      const res = await apiClient.get(`/admin/orders/${id}`)
      setDetail(res.data)
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat detail pesanan'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Overview cards deep-link here with ?focus=<id>.
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get('focus')
    if (focus) void openDetail(focus)
  }, [openDetail])

  const changeStatus = async (next: string) => {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      const res = await apiClient.patch(`/admin/orders/${detail.id}/status`, {
        status: next,
        ...(reason ? { reason } : {}),
      })
      setDetail(res.data)
      setReason('')
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal mengubah status pesanan'))
    } finally {
      setBusy(false)
    }
  }

  const applySearch = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pesanan</h1>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}

      <form onSubmit={applySearch} className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
          className="h-9 rounded-lg border border-neutral-200 px-3 text-sm"
        >
          <option value="">Semua status</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value] ?? value}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari ID pesanan atau email pelanggan"
          className="w-72 h-9 rounded-lg border border-neutral-200 px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
        >
          Cari
        </button>
        {(status || query) && (
          <button
            type="button"
            onClick={() => {
              setStatus('')
              setSearch('')
              setQuery('')
              setPage(1)
            }}
            className="h-9 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Reset
          </button>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
              <th className="h-10 px-4 font-medium">Pesanan</th>
              <th className="h-10 px-4 font-medium">Pelanggan</th>
              <th className="h-10 px-4 font-medium">Tanggal</th>
              <th className="h-10 px-4 font-medium text-right">Total</th>
              <th className="h-10 px-4 font-medium">Status</th>
              <th className="h-10 px-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Memuat…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Tidak ada pesanan yang cocok.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50">
                  <td className="px-4 py-3 font-mono text-xs">{order.id.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <p>{order.user?.name ?? '-'}</p>
                    <p className="text-xs text-neutral-500">{order.user?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatRupiah(order.totalPrice)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex h-5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        ORDER_STATUS_STYLES[order.status] ?? 'bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void openDetail(order.id)}
                      className="h-7 rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
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
            Halaman {meta.page} dari {meta.totalPages} · {meta.total} pesanan
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

      {detail && (
        <section className="rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
          <div className="flex items-center justify-between px-4 pb-4">
            <div>
              <h2 className="font-semibold text-neutral-900">Detail pesanan</h2>
              <p className="font-mono text-xs text-neutral-500">{detail.id}</p>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="h-7 rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Tutup
            </button>
          </div>

          <div className="grid gap-6 p-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-neutral-500">Item</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {detail.items.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.productName} × {item.quantity}
                        {item.variantSku ? ` (${item.variantSku})` : ''}
                      </span>
                      <span>{formatRupiah(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1 text-sm">
                <p className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <span>{formatRupiah(detail.subtotal)}</span>
                </p>
                {detail.discount > 0 && (
                  <p className="flex justify-between text-emerald-700">
                    <span>Diskon {detail.couponCode ? `(${detail.couponCode})` : ''}</span>
                    <span>-{formatRupiah(detail.discount)}</span>
                  </p>
                )}
                <p className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatRupiah(detail.totalPrice)}</span>
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500">Pembayaran</p>
                {detail.payments.length === 0 ? (
                  <p className="text-sm text-neutral-500">Belum ada percobaan pembayaran.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {detail.payments.map((payment) => (
                      <li key={payment.id} className="flex justify-between">
                        <span className="font-mono text-xs">{payment.provider}</span>
                        <span>{payment.status}</span>
                        <span>{formatRupiah(payment.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detail.status === 'PENDING' && detail.expiresAt && (
                <p className="text-xs text-neutral-500">
                  Batas bayar {formatDateTime(detail.expiresAt)}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-neutral-500">Pengiriman</p>
                <p className="mt-1 text-sm text-neutral-700">
                  {detail.shippingAddress
                    ? [
                        detail.shippingAddress.recipient,
                        detail.shippingAddress.line1,
                        detail.shippingAddress.city,
                        detail.shippingAddress.postalCode,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : 'Tidak ada alamat tersimpan.'}
                </p>
              </div>

              {detail.reservations && detail.reservations.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-neutral-500">Stok ditahan</p>
                  <ul className="mt-1 space-y-1 text-sm text-neutral-700">
                    {detail.reservations.map((hold) => (
                      <li key={`${hold.productId}-${hold.status}`}>
                        {hold.quantity} unit · {hold.status}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-neutral-500">Ubah status</p>
                {(detail.allowedTransitions ?? []).length === 0 ? (
                  <p className="mt-1 text-sm text-neutral-500">
                    Status {ORDER_STATUS_LABELS[detail.status] ?? detail.status} bersifat final.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {detail.allowedTransitions?.includes('REFUNDED') && (
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Alasan refund (opsional, tercatat di ledger stok)"
                        className="w-full h-9 rounded-lg border border-neutral-200 px-3 text-sm"
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {detail.allowedTransitions?.map((next) => (
                        <button
                          key={next}
                          type="button"
                          disabled={busy}
                          onClick={() => void changeStatus(next)}
                          className={`rounded px-3 py-2 text-sm font-medium disabled:opacity-40 ${
                            next === 'REFUNDED' || next === 'CANCELLED'
                              ? 'border border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'bg-neutral-900 text-white hover:bg-neutral-900/80'
                          }`}
                        >
                          {TRANSITION_LABELS[next] ?? next}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
