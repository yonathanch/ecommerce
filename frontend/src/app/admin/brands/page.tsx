'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { Panel } from '@/components/admin/ui'

interface BrandRow {
  id: string
  name: string
  slug: string
  createdAt: string
  productCount: number
}

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

/**
 * Brand screen. Like Kategori, this is a producer rather than a viewer: the
 * cards in "Top Fashion Brands" and the pages at /brands/<slug> are both built
 * from this list, and the product form can only pick a label that exists here.
 *
 * Deleting is deliberately blocked while products still carry the label —
 * `Product.brandId` is onDelete: SetNull, so allowing it would quietly strip the
 * label from every product and drop them off the brand page.
 */
export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('search', query)
      const suffix = params.toString()
      const res = await apiClient.get(`/admin/brands${suffix ? `?${suffix}` : ''}`)
      setBrands(res.data.items)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat brand'))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await apiClient.post('/admin/brands', { name })
      setNewName('')
      setNotice(
        `Brand "${res.data.name}" ditambahkan — halaman /brands/${res.data.slug} langsung bisa dipakai.`,
      )
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menambah brand'))
    } finally {
      setBusy(false)
    }
  }

  const startRename = (brand: BrandRow) => {
    setEditingId(brand.id)
    setEditingName(brand.name)
    setNotice('')
    setError('')
  }

  /** `value` comes from the input so Enter never races the last keystroke. */
  const rename = async (brand: BrandRow, value?: string) => {
    const name = (value ?? editingName).trim()
    if (!name || name === brand.name) {
      setEditingId(null)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await apiClient.patch(`/admin/brands/${brand.id}`, { name })
      setEditingId(null)
      setNotice(`Brand diubah menjadi "${name}" — halaman toko pindah ke /brands/${res.data.slug}.`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal mengubah brand'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (brand: BrandRow) => {
    const suffix =
      brand.productCount > 0 ? ` Masih ada ${brand.productCount} produk memakai label ini.` : ''
    if (!window.confirm(`Hapus brand "${brand.name}"?${suffix}`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.delete(`/admin/brands/${brand.id}`)
      setNotice(`Brand "${brand.name}" dihapus.`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menghapus brand'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Brand</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Label fashion yang tampil di bagian Top Fashion Brands dan punya halaman sendiri di{' '}
            <span className="font-mono">/brands/&lt;slug&gt;</span>. Form produk hanya bisa memilih
            label yang ada di daftar ini.
          </p>
        </div>
        <form onSubmit={create} className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama brand baru"
            maxLength={100}
            className="h-9 w-52 rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Tambah brand
          </button>
        </form>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <Panel
        title="Semua Brand"
        subtitle={`${brands.length} brand ditampilkan`}
        bodyClassName="px-0 pb-0"
        action={
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setQuery(search.trim())
            }}
            className="flex items-center gap-2"
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari brand…"
              className="h-9 w-48 rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
                <th className="h-10 px-4 font-medium">Nama</th>
                <th className="h-10 px-4 font-medium">Slug</th>
                <th className="h-10 px-4 text-right font-medium">Produk</th>
                <th className="h-10 px-4 font-medium">Dibuat</th>
                <th className="h-10 px-4 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    Memuat…
                  </td>
                </tr>
              ) : brands.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    {query ? 'Tidak ada brand yang cocok.' : 'Belum ada brand.'}
                  </td>
                </tr>
              ) : (
                brands.map((brand) => (
                  <tr
                    key={brand.id}
                    className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {editingId === brand.id ? (
                        <input
                          value={editingName}
                          autoFocus
                          maxLength={100}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void rename(brand, e.currentTarget.value)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="h-8 w-full rounded-lg border border-neutral-300 px-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
                        />
                      ) : (
                        brand.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* The storefront page this row owns, so the admin can check it. */}
                      <Link
                        href={`/brands/${brand.slug}`}
                        className="inline-flex items-center gap-1 font-mono text-xs text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
                      >
                        /brands/{brand.slug}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {brand.productCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {formatDateTime(brand.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editingId === brand.id ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void rename(brand)}
                              aria-label={`Simpan nama ${brand.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              aria-label="Batal"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startRename(brand)}
                              aria-label={`Ubah nama ${brand.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-100"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(brand)}
                              aria-label={`Hapus brand ${brand.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
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
        Brand yang masih dipakai produk tidak bisa dihapus — kosongkan dulu label produknya lewat menu
        Produk. Mengubah nama juga mengubah slug, sehingga alamat halaman brand di toko ikut pindah.
      </p>
    </div>
  )
}
