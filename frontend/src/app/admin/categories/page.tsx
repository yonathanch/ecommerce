'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { Panel } from '@/components/admin/ui'

interface CategoryRow {
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
 * Categories screen — wired to the real back-office endpoints.
 *
 * This screen is a producer, not just a viewer: the chips in the storefront
 * navigation and the `?category=` filter both come from the same list
 * (`GET /products/categories`), so adding, renaming or deleting a row here
 * changes the shop. The product form can only pick a name that exists, which is
 * what keeps a typo out of the storefront navigation.
 */
export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([])
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
      const res = await apiClient.get(`/admin/categories${suffix ? `?${suffix}` : ''}`)
      setCategories(res.data.items)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat kategori'))
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
      const res = await apiClient.post('/admin/categories', { name })
      setNewName('')
      setNotice(`Kategori "${res.data.name}" ditambahkan — chip-nya langsung muncul di navigasi toko.`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menambah kategori'))
    } finally {
      setBusy(false)
    }
  }

  const startRename = (category: CategoryRow) => {
    setEditingId(category.id)
    setEditingName(category.name)
    setNotice('')
    setError('')
  }

  /**
   * `value` lets the Enter key submit the input's own text. Reading the state
   * here instead would race the keystroke that produced it: the handler can run
   * before React has committed the last character, and the edit is then
   * silently dropped.
   */
  const rename = async (category: CategoryRow, value?: string) => {
    const name = (value ?? editingName).trim()
    if (!name || name === category.name) {
      setEditingId(null)
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.patch(`/admin/categories/${category.id}`, { name })
      setEditingId(null)
      setNotice(`Kategori diubah menjadi "${name}".`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal mengubah kategori'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (category: CategoryRow) => {
    // Deleting one in use is refused by the API with a product count, so the
    // dialog warns first rather than letting the admin find out via an error.
    const suffix = category.productCount > 0 ? ` Masih ada ${category.productCount} produk di dalamnya.` : ''
    if (!window.confirm(`Hapus kategori "${category.name}"?${suffix}`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.delete(`/admin/categories/${category.id}`)
      setNotice(`Kategori "${category.name}" dihapus.`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menghapus kategori'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Kategori</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Kelompokkan produk agar mudah ditemukan pembeli. Daftar ini yang menjadi chip
            navigasi di toko, jadi perubahan di sini langsung terlihat pembeli.
          </p>
        </div>
        <form onSubmit={create} className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama kategori baru"
            maxLength={100}
            className="h-9 w-52 rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Tambah kategori
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
        title="Semua Kategori"
        subtitle={`${categories.length} kategori ditampilkan`}
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
              placeholder="Cari kategori…"
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
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
                <th className="h-10 px-4 font-medium">Nama</th>
                <th className="h-10 px-4 font-medium">Slug</th>
                <th className="h-10 px-4 font-medium text-right">Produk</th>
                <th className="h-10 px-4 font-medium">Dibuat</th>
                <th className="h-10 px-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    Memuat…
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    {query ? 'Tidak ada kategori yang cocok.' : 'Belum ada kategori.'}
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr
                    key={category.id}
                    className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {editingId === category.id ? (
                        <input
                          value={editingName}
                          autoFocus
                          maxLength={100}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void rename(category, e.currentTarget.value)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="h-8 w-full rounded-lg border border-neutral-300 px-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
                        />
                      ) : (
                        category.name
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{category.slug}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                      {category.productCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {formatDateTime(category.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editingId === category.id ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void rename(category)}
                              aria-label={`Simpan nama ${category.name}`}
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
                              onClick={() => startRename(category)}
                              aria-label={`Ubah nama ${category.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-100"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void remove(category)}
                              aria-label={`Hapus kategori ${category.name}`}
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
        Kategori yang masih dipakai produk tidak bisa dihapus — pindahkan produknya dulu lewat
        menu Produk. Nama kategori juga tidak bisa sama dengan yang sudah ada.
      </p>
    </div>
  )
}
