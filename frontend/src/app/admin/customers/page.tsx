'use client'

import { useCallback, useEffect, useState } from 'react'
import apiClient from '@/lib/api-client'
import { formatDateTime, formatRupiah } from '@/lib/format'

interface CustomerRow {
  id: string
  email: string
  name: string | null
  createdAt: string
  ordersCount: number
  collectedOrders: number
  totalSpent: number
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [meta, setMeta] = useState<{ total: number; page: number; totalPages: number } | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
              <th className="h-10 px-4 font-medium">Pelanggan</th>
              <th className="h-10 px-4 font-medium">Terdaftar</th>
              <th className="h-10 px-4 font-medium text-right">Pesanan</th>
              <th className="h-10 px-4 font-medium text-right">Dibayar</th>
              <th className="h-10 px-4 font-medium text-right">Total belanja</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Memuat…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Tidak ada pelanggan yang cocok.
                </td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr key={customer.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50">
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
    </div>
  )
}
