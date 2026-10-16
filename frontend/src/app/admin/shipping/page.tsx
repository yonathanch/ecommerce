'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { Panel, StatusPill } from '@/components/admin/ui'
import { Dialog } from '@/components/admin/overlay'
import { ORDER_STATUS_LABELS, formatDateTime, formatRupiah } from '@/lib/format'

interface Shipment {
  id: string
  status: string
  totalPrice: number
  courier: string | null
  trackingNumber: string | null
  shippedAt: string
  createdAt: string
  itemCount: number
  destination: string | null
  user: { id: string; email: string; name: string | null }
}

interface ShipmentList {
  items: Shipment[]
  meta: { total: number; page: number; totalPages: number }
  summary: { missingTracking: number; inTransit: number; delivered: number }
}

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

/**
 * Pengiriman. The list is defined by `shippedAt` — the record that a parcel
 * actually left — rather than by status, because a refund can move an order out
 * of SHIPPED long after it was dispatched.
 *
 * The resi is authored on the Pesanan screen when the order is marked shipped;
 * what this screen adds is the ability to fill in or correct it afterwards,
 * which is what a mistyped tracking number needs.
 */
export default function AdminShippingPage() {
  const [data, setData] = useState<ShipmentList | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Shipment | null>(null)
  const [courier, setCourier] = useState('')
  const [tracking, setTracking] = useState('')
  const [busy, setBusy] = useState(false)
  // Save errors live inside the dialog, because that is where the user is looking.
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (query) params.set('search', query)
      if (missingOnly) params.set('missingTracking', 'true')
      const res = await apiClient.get(`/admin/shipments?${params.toString()}`)
      setData(res.data)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat pengiriman'))
    } finally {
      setLoading(false)
    }
  }, [page, query, missingOnly])

  useEffect(() => {
    void load()
  }, [load])

  const startEdit = (shipment: Shipment) => {
    setEditing(shipment)
    setCourier(shipment.courier ?? '')
    setTracking(shipment.trackingNumber ?? '')
    setNotice('')
    setSaveError('')
  }

  // True when the form no longer matches what is stored — the same partial-update
  // rule save() uses, so "dirty" here means "would actually send something".
  const isDirty =
    editing != null &&
    (courier.trim() !== (editing.courier ?? '') ||
      tracking.trim() !== (editing.trackingNumber ?? ''))

  // Closing is a destructive gesture when there are unsaved edits, so it asks
  // first rather than silently discarding what was typed.
  const requestClose = () => {
    if (isDirty && !window.confirm('Ada perubahan resi yang belum disimpan. Tutup tanpa menyimpan?')) {
      return
    }
    setEditing(null)
    setSaveError('')
  }

  const save = async () => {
    if (!editing) return
    setBusy(true)
    setError('')
    setNotice('')
    setSaveError('')
    try {
      // Only the fields that changed are sent, so this is a partial update and a
      // blank field never silently erases what is already stored.
      const body: Record<string, string> = {}
      if (courier.trim() !== (editing.courier ?? '')) body.courier = courier.trim()
      if (tracking.trim() !== (editing.trackingNumber ?? '')) body.trackingNumber = tracking.trim()

      if (Object.keys(body).length === 0) {
        setNotice('Tidak ada perubahan.')
        setEditing(null)
        return
      }

      await apiClient.patch(`/admin/orders/${editing.id}/shipment`, body)
      setNotice(`Resi pesanan ${editing.id.slice(0, 8)} diperbarui.`)
      setEditing(null)
      await load()
    } catch (e: any) {
      setSaveError(errorMessage(e, 'Gagal menyimpan resi'))
    } finally {
      setBusy(false)
    }
  }

  const summary = data?.summary

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pengiriman</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pesanan yang sudah dikirim beserta nomor resinya. Resi yang diisi di sini langsung terlihat
          pelanggan di halaman pesanan mereka.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total pengiriman', value: data?.meta.total ?? 0 },
          { label: 'Dalam perjalanan', value: summary?.inTransit ?? 0 },
          { label: 'Belum ada resi', value: summary?.missingTracking ?? 0 },
          { label: 'Sudah diterima', value: summary?.delivered ?? 0 },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl bg-white py-4 ring-1 ring-neutral-900/10">
            <div className="space-y-2 px-4">
              <p className="text-sm font-medium text-neutral-500">{tile.label}</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">
                {tile.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={Boolean(editing)}
        onClose={requestClose}
        busy={busy}
        title="Ubah resi"
        subtitle={
          editing ? (
            <span className="grid gap-0.5">
              <span className="font-mono text-xs">Pesanan {editing.id.slice(0, 12)}</span>
              <span>
                {editing.user?.name ?? '-'} · {editing.destination ?? 'tujuan belum diisi'}
              </span>
            </span>
          ) : undefined
        }
        maxWidth="sm:max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              form="resi-form"
              disabled={busy}
              className="h-9 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-50"
            >
              {busy ? 'Menyimpan…' : 'Simpan resi'}
            </button>
          </>
        }
      >
        <form
          id="resi-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          className="space-y-4"
        >
          {saveError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {saveError}
            </p>
          )}
          <label className="block text-sm">
            <span className="block font-medium text-neutral-700">Kurir</span>
            <input
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              placeholder="mis. JNE Reguler"
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 px-3 text-sm outline-none focus:border-neutral-400"
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-neutral-700">Nomor resi</span>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="mis. JNE1234567890"
              className="mt-1 h-9 w-full rounded-lg border border-neutral-200 px-3 font-mono text-sm outline-none focus:border-neutral-400"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Resi yang disimpan langsung terlihat oleh pelanggan di halaman pesanan mereka.
            </span>
          </label>
        </form>
      </Dialog>

      <Panel title="Daftar pengiriman" subtitle={`${data?.meta.total ?? 0} pengiriman`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setPage(1)
              setQuery(search.trim())
            }}
            className="relative w-full max-w-xs"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari resi, kurir, atau pesanan…"
              className="h-9 w-full rounded-lg border border-neutral-200 pl-9 pr-3 text-sm outline-none focus:border-neutral-400"
            />
          </form>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => {
                setMissingOnly(e.target.checked)
                setPage(1)
              }}
            />
            Hanya yang belum ada resi
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            Muat ulang
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-500">
                <th className="h-10 px-4 font-medium">Resi</th>
                <th className="h-10 px-4 font-medium">Pesanan</th>
                <th className="h-10 px-4 font-medium">Pelanggan</th>
                <th className="h-10 px-4 font-medium">Kurir</th>
                <th className="h-10 px-4 font-medium">Tujuan</th>
                <th className="h-10 px-4 font-medium">Dikirim</th>
                <th className="h-10 px-4 text-right font-medium">Status</th>
                <th className="h-10 px-4" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                    Memuat…
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                    Belum ada pengiriman. Tandai pesanan berstatus Dibayar sebagai dikirim untuk
                    memulai.
                  </td>
                </tr>
              ) : (
                data.items.map((shipment) => (
                  <tr key={shipment.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-100/50">
                    <td className="px-4 py-3">
                      {shipment.trackingNumber ? (
                        <span className="font-mono text-xs text-neutral-900">
                          {shipment.trackingNumber}
                        </span>
                      ) : (
                        <StatusPill tone="amber">Belum ada resi</StatusPill>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders?focus=${shipment.id}`}
                        className="font-mono text-xs text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
                      >
                        {shipment.id.slice(0, 8)}
                      </Link>
                      <span className="block text-xs text-neutral-400">{shipment.itemCount} item</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {shipment.user?.name ?? '-'}
                      <span className="block text-xs text-neutral-400">{shipment.user?.email}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{shipment.courier ?? '—'}</td>
                    <td className="px-4 py-3 text-neutral-700">{shipment.destination ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {formatDateTime(shipment.shippedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusPill tone={shipment.status === 'DELIVERED' ? 'green' : 'blue'}>
                        {ORDER_STATUS_LABELS[shipment.status] ?? shipment.status}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(shipment)}
                        className="h-8 rounded-lg border border-neutral-200 px-2.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
                      >
                        {shipment.trackingNumber ? 'Ubah resi' : 'Isi resi'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
          <span>Total nilai kirim: {formatRupiah(data?.items.reduce((sum, s) => sum + s.totalPrice, 0) ?? 0)} (halaman ini)</span>
          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs">
                Halaman {data.meta.page} dari {data.meta.totalPages}
              </span>
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
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 rounded-lg border border-neutral-200 px-3 text-sm disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
