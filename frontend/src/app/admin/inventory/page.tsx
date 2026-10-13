'use client'

import { useCallback, useEffect, useState } from 'react'
import apiClient from '@/lib/api-client'
import { LEDGER_TYPE_LABELS, formatDateTime, formatRupiah } from '@/lib/format'

interface InventoryRow {
  id: string
  name: string
  category: string
  price: number
  stock: number
  reserved: number
  available: number
  variants: Array<{ sku: string; options: Record<string, string>; stock: number }>
}

interface LedgerRow {
  id: string
  type: string
  quantity: number
  stockBefore: number
  stockAfter: number
  variantSku: string | null
  reason: string | null
  createdAt: string
}

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

export default function AdminInventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [threshold, setThreshold] = useState(5)
  const [lowOnly, setLowOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [selected, setSelected] = useState<InventoryRow | null>(null)
  const [delta, setDelta] = useState('')
  const [variantSku, setVariantSku] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [ledger, setLedger] = useState<LedgerRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (lowOnly) params.set('lowOnly', 'true')
      if (query) params.set('search', query)
      const res = await apiClient.get(`/admin/inventory?${params.toString()}`)
      setRows(res.data.items)
      setThreshold(res.data.threshold)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat inventori'))
    } finally {
      setLoading(false)
    }
  }, [lowOnly, query])

  const loadLedger = useCallback(async (productId?: string) => {
    try {
      const res = await apiClient.get(
        `/inventory/history${productId ? `?productId=${productId}` : ''}`,
      )
      setLedger(res.data)
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat riwayat stok'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadLedger(selected?.id)
  }, [selected?.id, loadLedger])

  const submitAdjust = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await apiClient.post('/inventory/adjust', {
        productId: selected.id,
        delta: Number(delta),
        reason: reason.trim(),
        ...(variantSku ? { variantSku } : {}),
      })
      setNotice(
        variantSku
          ? `Stok varian ${variantSku} sekarang ${res.data.stock}.`
          : `Stok ${selected.name} sekarang ${res.data.stock}.`,
      )
      setDelta('')
      setReason('')
      await load()
      await loadLedger(selected.id)
    } catch (e: any) {
      setError(errorMessage(e, 'Penyesuaian stok ditolak'))
    } finally {
      setBusy(false)
    }
  }

  const runSweeper = async () => {
    setBusy(true)
    setNotice('')
    try {
      const res = await apiClient.post('/orders/maintenance/expire', {})
      setNotice(
        `Sweeper selesai: ${res.data.cancelled} pesanan dibatalkan, ${res.data.released} hold dilepas.`,
      )
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Sweeper gagal dijalankan'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Inventori</h1>
          <p className="text-sm text-neutral-500">
            Ambang stok menipis: {threshold} unit tersedia. Hanya modul inventori yang boleh
            mengubah stok, setiap perubahan tercatat di ledger.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSweeper()}
          className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
        >
          Jalankan sweeper pesanan kedaluwarsa
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(search.trim())
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama produk atau SKU varian"
          className="w-72 h-9 rounded-lg border border-neutral-200 px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
        >
          Cari
        </button>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4"
          />
          Hanya stok menipis
        </label>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
              <th className="h-10 px-4 font-medium">Produk</th>
              <th className="h-10 px-4 font-medium text-right">Harga</th>
              <th className="h-10 px-4 font-medium text-right">Stok</th>
              <th className="h-10 px-4 font-medium text-right">Tertahan</th>
              <th className="h-10 px-4 font-medium text-right">Tersedia</th>
              <th className="h-10 px-4 font-medium">Varian</th>
              <th className="h-10 px-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Memuat…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-500">
                  Tidak ada produk yang cocok.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-900">{row.name}</p>
                    <p className="text-xs text-neutral-500">{row.category}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{formatRupiah(row.price)}</td>
                  <td className="px-4 py-3 text-right">{row.stock}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{row.reserved}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      row.available <= threshold ? 'text-rose-600' : 'text-neutral-900'
                    }`}
                  >
                    {row.available}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {row.variants.length === 0 ? (
                      <span className="text-neutral-400">tanpa varian</span>
                    ) : (
                      <span>
                        {row.variants.length} SKU ·{' '}
                        {row.variants
                          .slice(0, 3)
                          .map((variant) => `${variant.sku} (${variant.stock})`)
                          .join(', ')}
                        {row.variants.length > 3 ? '…' : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(row)
                        setVariantSku('')
                        setDelta('')
                        setReason('')
                      }}
                      className="h-7 rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      Sesuaikan
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <section className="rounded-xl bg-white p-4 ring-1 ring-neutral-900/10">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">
              Penyesuaian stok · {selected.name}
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="h-7 rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Tutup
            </button>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Stok saat ini {selected.stock} · tertahan {selected.reserved} · tersedia{' '}
            {selected.available}
          </p>

          <form onSubmit={submitAdjust} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-xs font-medium text-neutral-500">Delta</span>
              <input
                required
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="-3 atau 12"
                className="mt-1 w-28 h-9 rounded-lg border border-neutral-200 px-3 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-neutral-500">Varian</span>
              <select
                value={variantSku}
                onChange={(e) => setVariantSku(e.target.value)}
                className="mt-1 w-56 h-9 rounded-lg border border-neutral-200 px-3 text-sm"
              >
                <option value="">Level produk</option>
                {selected.variants.map((variant) => (
                  <option key={variant.sku} value={variant.sku}>
                    {variant.sku} · stok {variant.stock}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-neutral-500">Alasan</span>
              <input
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="restock supplier"
                className="mt-1 w-64 h-9 rounded-lg border border-neutral-200 px-3 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-9 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-40"
            >
              Simpan
            </button>
          </form>
        </section>
      )}

      <section className="rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-neutral-900">
            Riwayat stok {selected ? `· ${selected.name}` : '· 100 terbaru'}
          </h2>
        </div>
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
              <th className="h-10 px-4 font-medium">Waktu</th>
              <th className="h-10 px-4 font-medium">Jenis</th>
              <th className="h-10 px-4 font-medium text-right">Qty</th>
              <th className="h-10 px-4 font-medium text-right">Sebelum</th>
              <th className="h-10 px-4 font-medium text-right">Sesudah</th>
              <th className="h-10 px-4 font-medium">Varian / alasan</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Belum ada pergerakan stok.
                </td>
              </tr>
            ) : (
              ledger.map((row) => (
                <tr key={row.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50">
                  <td className="px-4 py-3 text-xs text-neutral-600">{formatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3">{LEDGER_TYPE_LABELS[row.type] ?? row.type}</td>
                  <td className="px-4 py-3 text-right">{row.quantity}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{row.stockBefore}</td>
                  <td className="px-4 py-3 text-right font-medium">{row.stockAfter}</td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {row.variantSku ?? '-'} · {row.reason ?? '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
