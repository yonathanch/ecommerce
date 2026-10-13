'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import apiClient from '@/lib/api-client'
import {
  COUPON_STATUS_LABELS,
  COUPON_STATUS_STYLES,
  formatDate,
  formatRupiah,
} from '@/lib/format'
import { Panel } from '@/components/admin/ui'

interface Coupon {
  id: string
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  minPurchase: number | null
  maxDiscount: number | null
  usageLimit: number | null
  usedCount: number
  expiresAt: string | null
  active: boolean
  /** Derived by the API so this screen cannot disagree with checkout. */
  status: 'AKTIF' | 'NONAKTIF' | 'KEDALUWARSA' | 'HABIS'
}

interface CouponSummary {
  total: number
  active: number
  expired: number
  exhausted: number
  redemptions: number
}

interface FormState {
  code: string
  type: 'PERCENT' | 'FIXED'
  value: string
  minPurchase: string
  maxDiscount: string
  usageLimit: string
  expiresAt: string
}

const EMPTY_FORM: FormState = {
  code: '',
  type: 'PERCENT',
  value: '',
  minPurchase: '',
  maxDiscount: '',
  usageLimit: '',
  expiresAt: '',
}

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

const describeValue = (coupon: Pick<Coupon, 'type' | 'value'>) =>
  coupon.type === 'PERCENT' ? `${coupon.value}%` : formatRupiah(coupon.value)

/**
 * Discounts screen — wired to the coupon endpoints.
 *
 * This is a producer for the storefront: `POST /coupons/validate`, which the
 * checkout page calls, reads the rows managed here. That is why a coupon is
 * never deleted once redeemed — CouponUsage cascades on delete, and merging the
 * history away would let the same code work again for someone who already used it.
 */
export default function AdminDiscountsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [summary, setSummary] = useState<CouponSummary | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('search', query)
      if (activeOnly) params.set('activeOnly', 'true')
      const suffix = params.toString()
      const res = await apiClient.get(`/admin/coupons${suffix ? `?${suffix}` : ''}`)
      setCoupons(res.data.items)
      setSummary(res.data.summary)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat kupon'))
    } finally {
      setLoading(false)
    }
  }, [query, activeOnly])

  useEffect(() => {
    void load()
  }, [load])

  const reset = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    // Empty optional fields are sent as null on purpose: that is how the API
    // clears them (no minimum, no cap, unlimited redemptions, never expires).
    const payload = {
      code: form.code.trim(),
      type: form.type,
      value: Number(form.value),
      minPurchase: form.minPurchase === '' ? null : Number(form.minPurchase),
      maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
      usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
      expiresAt: form.expiresAt === '' ? null : form.expiresAt,
    }

    try {
      if (editingId) {
        await apiClient.patch(`/admin/coupons/${editingId}`, payload)
        setNotice(`Kupon ${payload.code} diperbarui.`)
      } else {
        await apiClient.post('/admin/coupons', payload)
        setNotice(`Kupon ${payload.code} dibuat — sudah bisa dipakai pembeli di checkout.`)
      }
      reset()
      setFormOpen(false)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menyimpan kupon'))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (coupon: Coupon) => {
    setEditingId(coupon.id)
    setFormOpen(true)
    setNotice('')
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: String(coupon.value),
      minPurchase: coupon.minPurchase === null ? '' : String(coupon.minPurchase),
      maxDiscount: coupon.maxDiscount === null ? '' : String(coupon.maxDiscount),
      usageLimit: coupon.usageLimit === null ? '' : String(coupon.usageLimit),
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
    })
  }

  const toggleActive = async (coupon: Coupon) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.patch(`/admin/coupons/${coupon.id}`, { active: !coupon.active })
      setNotice(`Kupon ${coupon.code} ${coupon.active ? 'dinonaktifkan' : 'diaktifkan'}.`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal mengubah status kupon'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (coupon: Coupon) => {
    if (!window.confirm(`Hapus kupon ${coupon.code}?`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.delete(`/admin/coupons/${coupon.id}`)
      setNotice(`Kupon ${coupon.code} dihapus.`)
      if (editingId === coupon.id) {
        reset()
        setFormOpen(false)
      }
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menghapus kupon'))
    } finally {
      setBusy(false)
    }
  }

  const tiles = [
    { label: 'Kupon aktif', value: summary?.active ?? 0 },
    { label: 'Total pemakaian', value: summary?.redemptions ?? 0 },
    { label: 'Kedaluwarsa', value: summary?.expired ?? 0 },
    { label: 'Kuota habis', value: summary?.exhausted ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Diskon</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Atur kupon dan potongan harga. Kupon yang dibuat di sini langsung bisa dipakai
            pembeli di halaman checkout.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            reset()
            setFormOpen((open) => !open)
            setNotice('')
          }}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
        >
          {formOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {formOpen ? 'Tutup' : 'Buat diskon'}
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-white px-4 py-4 ring-1 ring-neutral-900/10">
            <p className="text-sm text-neutral-500">{tile.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {formOpen && (
        <Panel title={editingId ? 'Ubah kupon' : 'Kupon baru'} subtitle="Kode disimpan dalam huruf besar.">
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Kode</span>
              <input
                required
                minLength={3}
                maxLength={32}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="SUMMER20"
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm uppercase outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Tipe</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              >
                <option value="PERCENT">Persen (%)</option>
                <option value="FIXED">Nominal (Rp)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">
                Nilai {form.type === 'PERCENT' ? '(%)' : '(Rp)'}
              </span>
              <input
                required
                type="number"
                min={1}
                max={form.type === 'PERCENT' ? 100 : undefined}
                step={form.type === 'PERCENT' ? 1 : 0.01}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Min. belanja (opsional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.minPurchase}
                onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Maks. potongan (opsional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Batas pemakaian (opsional)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Berlaku sampai (opsional)</span>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <div className="flex items-end gap-2 md:col-span-3">
              <button
                type="submit"
                disabled={busy}
                className="h-9 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-40"
              >
                {editingId ? 'Simpan perubahan' : 'Buat kupon'}
              </button>
              <button
                type="button"
                onClick={() => {
                  reset()
                  setFormOpen(false)
                }}
                className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
              >
                Batal
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        title="Semua Kupon"
        subtitle={`${coupons.length} kupon ditampilkan`}
        bodyClassName="px-0 pb-0"
        action={
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setQuery(search.trim())
            }}
            className="flex items-center gap-2"
          >
            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Hanya yang bisa dipakai
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode…"
              className="h-9 w-40 rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
            />
            <button
              type="submit"
              className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Cari
            </button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
                <th className="h-10 px-4 font-medium">Kode</th>
                <th className="h-10 px-4 font-medium">Tipe</th>
                <th className="h-10 px-4 font-medium">Nilai</th>
                <th className="h-10 px-4 font-medium text-right">Min. belanja</th>
                <th className="h-10 px-4 font-medium text-right">Terpakai</th>
                <th className="h-10 px-4 font-medium">Berlaku sampai</th>
                <th className="h-10 px-4 font-medium">Status</th>
                <th className="h-10 px-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
                    Memuat…
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-500">
                    {query || activeOnly ? 'Tidak ada kupon yang cocok.' : 'Belum ada kupon.'}
                  </td>
                </tr>
              ) : (
                coupons.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-900">
                      {coupon.code}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {coupon.type === 'PERCENT' ? 'Persen' : 'Nominal'}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {describeValue(coupon)}
                      {coupon.maxDiscount ? (
                        <span className="block text-xs text-neutral-500">
                          maks {formatRupiah(coupon.maxDiscount)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {coupon.minPurchase ? formatRupiah(coupon.minPurchase) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {coupon.usedCount}
                      {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'Tanpa batas'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          COUPON_STATUS_STYLES[coupon.status] ?? 'bg-neutral-500/10 text-neutral-600'
                        }`}
                      >
                        {COUPON_STATUS_LABELS[coupon.status] ?? coupon.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleActive(coupon)}
                          aria-label={`${coupon.active ? 'Nonaktifkan' : 'Aktifkan'} kupon ${coupon.code}`}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-40 ${
                            coupon.active
                              ? 'text-neutral-600 hover:bg-neutral-100'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(coupon)}
                          aria-label={`Ubah kupon ${coupon.code}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(coupon)}
                          aria-label={`Hapus kupon ${coupon.code}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="text-xs text-neutral-500">
        Kupon yang sudah pernah dipakai tidak bisa dihapus — nonaktifkan saja, supaya riwayat
        pemakaian dan pembatasannya tetap utuh. Pelanggan memakai kode ini di halaman checkout.
      </p>
    </div>
  )
}
