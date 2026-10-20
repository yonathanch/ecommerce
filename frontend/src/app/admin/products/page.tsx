'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  ImagePlus,
  LayoutGrid,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import apiClient from '@/lib/api-client'
import { formatRupiah } from '@/lib/format'
import { Panel, StatusPill } from '@/components/admin/ui'

interface AdminVariant {
  sku: string
  options: Record<string, string> | null
  price: number | null
  stock: number
  weight: number | null
  imageUrl: string | null
}

interface AdminProduct {
  id: string
  name: string
  description: string | null
  price: number
  stock: number
  reserved: number
  available: number
  category: string
  brand: { id: string; name: string; slug: string } | null
  images?: Array<{ url: string }>
  variants: AdminVariant[]
}

/** One row in the variant editor. Strings, because it is driven by inputs. */
interface VariantRow {
  sku: string
  /** "Warna: Hitam, Ukuran: 42" — the axes the product detail page renders. */
  options: string
  price: string
  stock: string
  weight: string
  imageUrl: string
  /**
   * New SKUs accept an opening stock. Existing ones do not: their stock only
   * moves through the Inventori screen so it always leaves a ledger row.
   */
  isNew: boolean
}

interface FormState {
  name: string
  category: string
  brand: string
  price: string
  stock: string
  description: string
  imageUrl: string
  variants: VariantRow[]
}

const EMPTY_FORM: FormState = {
  name: '',
  category: '',
  brand: '',
  price: '',
  stock: '',
  description: '',
  imageUrl: '',
  variants: [],
}

const EMPTY_VARIANT: VariantRow = {
  sku: '',
  options: '',
  price: '',
  stock: '',
  weight: '',
  imageUrl: '',
  isNew: true,
}

/** Mirrors the server-side multer cap so oversized files fail fast, before any upload starts. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

/** "Warna: Hitam, Ukuran: 42" -> { Warna: 'Hitam', Ukuran: '42' }. */
function parseOptions(raw: string): Record<string, string> | undefined {
  const options: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const [key, ...rest] = entry.split(':')
    const name = key.trim()
    const value = rest.join(':').trim()
    if (name && value) options[name] = value
  }
  return Object.keys(options).length > 0 ? options : undefined
}

/** Stored options back into the single editable line. */
function formatOptions(options: Record<string, string> | null): string {
  return Object.entries(options ?? {})
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ')
}

const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))

/** Storefront-style availability badge, mirroring the template's status pills. */
function stockStatus(product: AdminProduct): { label: string; tone: 'green' | 'amber' | 'rose' } {
  if (product.stock <= 0) return { label: 'Habis', tone: 'rose' }
  if (product.stock <= 5) return { label: 'Stok menipis', tone: 'amber' }
  return { label: 'Tersedia', tone: 'green' }
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [brands, setBrands] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, categoryList, brandList] = await Promise.all([
        apiClient.get('/products?limit=100'),
        apiClient.get('/products/categories'),
        // Brands are owned by the catalog (seeded, rendered at /brands/<slug>),
        // so the form picks from this closed list instead of inventing a label.
        apiClient.get('/products/brands'),
      ])
      setProducts(list.data.items)
      setCategories(categoryList.data)
      setBrands(brandList.data)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat produk'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // "Tambah Produk" in the sidebar links to /admin/products?new=1, so opening
  // the create form stays a plain link instead of a separate route.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('new')) {
      setFormOpen(true)
    }
  }, [])

  // The palette, the stock bell and a low-stock alert all deep-link here with
  // ?focus=<id>. The form opens on the loaded row, so the admin lands on the
  // product itself rather than on a list they must search again.
  const focusApplied = useRef(false)
  useEffect(() => {
    if (focusApplied.current || products.length === 0) return
    const focus = new URLSearchParams(window.location.search).get('focus')
    if (!focus) return
    const product = products.find((item) => item.id === focus)
    if (!product) return
    focusApplied.current = true
    startEdit(product)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  const reset = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  /**
   * Product images are files, not pasted URLs: the picked file goes to
   * POST /uploads/images straight away and the URL it returns is stored in
   * form.imageUrl — the payload below (imageUrls) is unchanged.
   */
  const pickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clear so choosing the same file again (e.g. after "Hapus") still fires.
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG, PNG, WebP, atau GIF).')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Ukuran gambar maksimal 5 MB.')
      return
    }
    setUploadingImage(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      // postForm: the shared client defaults to Content-Type application/json,
      // which would serialize FormData as JSON instead of sending multipart.
      const res = await apiClient.postForm('/uploads/images', body)
      setForm((current) => ({ ...current, imageUrl: res.data.url }))
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal mengunggah gambar'))
    } finally {
      setUploadingImage(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')

    const blankSku = form.variants.find((row) => row.sku.trim() === '')
    if (blankSku) {
      setError('Setiap varian butuh SKU.')
      return
    }

    setBusy(true)

    const variants = form.variants.map((row) => {
      const entry: Record<string, unknown> = { sku: row.sku.trim() }
      const options = parseOptions(row.options)
      if (options) entry.options = options
      const price = optionalNumber(row.price)
      if (price !== undefined) entry.price = price
      const weight = optionalNumber(row.weight)
      if (weight !== undefined) entry.weight = weight
      if (row.imageUrl.trim()) entry.imageUrl = row.imageUrl.trim()
      // Existing SKUs are sent without stock on purpose: only a brand-new SKU
      // gets an opening balance here, everything else goes through the ledger.
      if (row.isNew) {
        const stock = optionalNumber(row.stock)
        if (stock !== undefined) entry.stock = stock
      }
      return entry
    })

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category.trim(),
      brand: form.brand || null,
      price: Number(form.price),
      // The gallery field is the whole gallery: empty means "no image".
      imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
      variants,
      ...(form.stock === '' ? {} : { stock: Number(form.stock) }),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    }

    try {
      if (editingId) {
        await apiClient.put(`/products/${editingId}`, payload)
        setNotice(`Produk "${payload.name}" diperbarui.`)
      } else {
        await apiClient.post('/products', payload)
        setNotice(`Produk "${payload.name}" ditambahkan ke katalog.`)
      }
      reset()
      setFormOpen(false)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menyimpan produk'))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (product: AdminProduct) => {
    setEditingId(product.id)
    setNotice('')
    setFormOpen(true)
    setOpenMenu(null)
    setForm({
      name: product.name,
      category: product.category,
      brand: product.brand?.slug ?? '',
      price: String(product.price),
      stock: String(product.stock),
      description: product.description ?? '',
      imageUrl: product.images?.[0]?.url ?? '',
      variants: (product.variants ?? []).map((variant) => ({
        sku: variant.sku,
        options: formatOptions(variant.options),
        price: variant.price !== null && variant.price !== undefined ? String(variant.price) : '',
        stock: String(variant.stock),
        weight: variant.weight !== null && variant.weight !== undefined ? String(variant.weight) : '',
        imageUrl: variant.imageUrl ?? '',
        isNew: false,
      })),
    })
  }

  const updateVariant = (index: number, patch: Partial<VariantRow>) => {
    setForm((current) => ({
      ...current,
      variants: current.variants.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }))
  }

  const remove = async (product: AdminProduct) => {
    setOpenMenu(null)
    if (!window.confirm(`Hapus "${product.name}" dari katalog? Tindakan ini permanen.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.delete(`/products/${product.id}`)
      if (editingId === product.id) {
        reset()
        setFormOpen(false)
      }
      setNotice(`Produk "${product.name}" dihapus.`)
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menghapus produk'))
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term),
    )
  }, [products, search])

  const stats = useMemo(() => {
    const total = products.length
    const inStock = products.filter((p) => p.stock > 5).length
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length
    const outOfStock = products.filter((p) => p.stock <= 0).length
    return { total, inStock, lowStock, outOfStock }
  }, [products])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const tiles = [
    { label: 'Total produk', value: stats.total },
    { label: 'Stok aman', value: stats.inStock },
    { label: 'Stok menipis', value: stats.lowStock },
    { label: 'Produk habis', value: stats.outOfStock },
  ]

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Produk</h1>
          <p className="text-sm text-neutral-500">Kelola katalog produk Anda.</p>
        </div>
        <div className="flex items-center gap-2 [&_a]:h-9 [&_button]:h-9">
          <Link
            href="/products"
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            <LayoutGrid className="size-4" />
            Storefront
          </Link>
          <button
            type="button"
            onClick={() => {
              reset()
              setFormOpen((open) => (editingId ? true : !open))
              setNotice('')
            }}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 text-sm font-medium text-white transition hover:bg-neutral-900/80"
          >
            <Plus className="size-4" />
            Tambah produk
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {/* ------------------------------------------------------------ tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
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

      {/* ------------------------------------------------------------- form */}
      {formOpen && (
        <form onSubmit={submit} className="rounded-xl bg-white px-4 py-4 ring-1 ring-neutral-900/10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base leading-snug font-medium text-neutral-900">
              {editingId ? 'Ubah produk' : 'Tambah produk'}
            </h2>
            <button
              type="button"
              onClick={() => {
                reset()
                setFormOpen(false)
              }}
              className="text-sm text-neutral-500 hover:text-neutral-800"
            >
              Tutup
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Nama</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Kategori</span>
              {/*
                A closed list, not a free-text datalist: the API only accepts a
                category that already exists, because this list is what the
                storefront renders as navigation chips.
              */}
              <select
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              >
                <option value="">Pilih kategori…</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutral-500">
                Kategori dikelola di menu{' '}
                <Link href="/admin/categories" className="underline underline-offset-2 hover:text-neutral-900">
                  Kategori
                </Link>
                .
              </span>
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Brand (opsional)</span>
              {/*
                Closed list for the same reason as categories: the API rejects an
                unknown label, and this list is what the storefront renders as
                brand cards and /brands/<slug> pages.
              */}
              <select
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              >
                <option value="">Tanpa brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.slug}>
                    {brand.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutral-500">
                Tampil di bagian Top Fashion Brands dan halaman{' '}
                <span className="font-mono">/brands/&lt;slug&gt;</span>. Brand dikelola di menu{' '}
                <Link href="/admin/brands" className="underline underline-offset-2 hover:text-neutral-900">
                  Brand
                </Link>
                .
              </span>
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Harga</span>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <label className="text-sm">
              <span className="block text-sm font-medium text-neutral-500">Stok</span>
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>
            <div className="text-sm md:col-span-2">
              <span className="block text-sm font-medium text-neutral-500">
                Gambar produk (opsional)
              </span>
              {/*
                Replaces the old "paste a URL" input: the file uploads on pick
                and the returned URL fills form.imageUrl, so this stays the
                whole gallery — picking one image replaces it, "Hapus" clears it.
              */}
              <div className="mt-1 flex items-center gap-3">
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt="Pratinjau gambar produk"
                    className="size-16 shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 object-cover"
                  />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400">
                    <ImagePlus className="size-5" />
                  </span>
                )}
                <div className="flex flex-col items-start gap-1.5">
                  <div className="flex gap-2">
                    <label
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100 ${
                        uploadingImage ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingImage}
                        onChange={pickImage}
                        className="sr-only"
                      />
                      <Upload className="size-4" />
                      {form.imageUrl ? 'Ganti gambar' : 'Pilih gambar'}
                    </label>
                    {form.imageUrl && !uploadingImage && (
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, imageUrl: '' }))}
                        className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                  <span className="block text-xs text-neutral-500">
                    {uploadingImage
                      ? 'Mengunggah gambar…'
                      : 'JPG, PNG, WebP, atau GIF — maksimal 5 MB. Kosongkan bila tanpa gambar.'}
                  </span>
                </div>
              </div>
            </div>
            <label className="text-sm md:col-span-3">
              <span className="block text-sm font-medium text-neutral-500">Deskripsi</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
              />
            </label>

            {/* ------------------------------------------------ variant editor */}
            <div className="rounded-lg border border-neutral-200 p-3 md:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-medium text-neutral-900">Varian</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Satu baris per SKU. Opsi ditulis{' '}
                    <span className="font-mono">Nama: Nilai</span> dipisah koma, mis.{' '}
                    <span className="font-mono">Warna: Hitam, Ukuran: 42</span> — inilah pilihan yang
                    tampil di halaman produk.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      variants: [...current.variants, { ...EMPTY_VARIANT }],
                    }))
                  }
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                >
                  <Plus className="size-4" />
                  Tambah varian
                </button>
              </div>

              {form.variants.length === 0 ? (
                <p className="mt-3 text-xs text-neutral-500">
                  Belum ada varian. Produk tanpa varian tetap bisa dijual.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {form.variants.map((row, index) => (
                    <div
                      key={index}
                      className="grid gap-2 rounded-lg bg-neutral-50 p-2 md:grid-cols-12"
                    >
                      <label className="text-xs md:col-span-3">
                        <span className="block text-neutral-500">SKU</span>
                        <input
                          required
                          value={row.sku}
                          onChange={(e) => updateVariant(index, { sku: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-neutral-400"
                        />
                      </label>
                      <label className="text-xs md:col-span-5">
                        <span className="block text-neutral-500">Opsi</span>
                        <input
                          value={row.options}
                          onChange={(e) => updateVariant(index, { options: e.target.value })}
                          placeholder="Warna: Hitam, Ukuran: 42"
                          className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400"
                        />
                      </label>
                      <label className="text-xs md:col-span-4">
                        <span className="block text-neutral-500">Harga (opsional)</span>
                        <input
                          type="number"
                          min={0}
                          value={row.price}
                          onChange={(e) => updateVariant(index, { price: e.target.value })}
                          placeholder="ikut harga produk"
                          className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400"
                        />
                      </label>
                      <label className="text-xs md:col-span-3">
                        <span className="block text-neutral-500">Stok</span>
                        <input
                          type="number"
                          min={0}
                          /* Existing SKUs keep the stock they have: stock only
                             moves through the Inventori ledger, with a reason. */
                          disabled={!row.isNew}
                          value={row.stock}
                          onChange={(e) => updateVariant(index, { stock: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400 disabled:bg-neutral-100 disabled:text-neutral-500"
                        />
                      </label>
                      <label className="text-xs md:col-span-3">
                        <span className="block text-neutral-500">Berat (opsional)</span>
                        <input
                          type="number"
                          min={0}
                          value={row.weight}
                          onChange={(e) => updateVariant(index, { weight: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400"
                        />
                      </label>
                      <label className="text-xs md:col-span-4">
                        <span className="block text-neutral-500">URL gambar (opsional)</span>
                        <input
                          value={row.imageUrl}
                          onChange={(e) => updateVariant(index, { imageUrl: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none focus:border-neutral-400"
                        />
                      </label>
                      <div className="flex items-end md:col-span-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              variants: current.variants.filter((_, i) => i !== index),
                            }))
                          }
                          className="flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-rose-200 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="size-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-xs text-neutral-500">
                Stok SKU baru adalah saldo awalnya. Stok SKU yang sudah ada hanya berubah lewat{' '}
                <Link
                  href="/admin/inventory"
                  className="underline underline-offset-2 hover:text-neutral-900"
                >
                  Inventori
                </Link>{' '}
                supaya setiap pergerakan punya alasan di ledger.
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy || uploadingImage}
              className="h-9 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-50"
            >
              {editingId ? 'Simpan perubahan' : 'Tambah produk'}
            </button>
            <button
              type="button"
              onClick={() => {
                reset()
                setFormOpen(false)
              }}
              className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------ table */}
      <Panel title="Semua produk" subtitle={`${filtered.length} produk`} bodyClassName="px-4 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Cari produk…"
              className="h-9 w-full rounded-lg border border-neutral-200 pl-9 pr-3 text-sm outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            Muat ulang
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-500">
                <th className="h-10 px-4 font-medium">Produk</th>
                <th className="h-10 px-4 font-medium">Kategori</th>
                <th className="h-10 px-4 text-right font-medium">Harga</th>
                <th className="h-10 px-4 text-right font-medium">Stok</th>
                <th className="h-10 px-4 text-right font-medium">Tersedia</th>
                <th className="h-10 px-4 text-right font-medium">Status</th>
                <th className="h-10 px-4" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                    Memuat…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                    Tidak ada produk yang cocok.
                  </td>
                </tr>
              ) : (
                rows.map((product) => {
                  const status = stockStatus(product)
                  const image = product.images?.find((i) => i?.url)?.url
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-100/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={image}
                              alt={product.name}
                              className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-400">
                              <Package className="h-4 w-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={`/products/${product.id}`}
                              className="font-medium text-neutral-900 transition hover:text-neutral-900"
                            >
                              {product.name}
                            </Link>
                            <p className="text-xs text-neutral-500">
                              {product.brand ? `${product.brand.name} · ` : ''}
                              {product.variants?.length ?? 0} SKU · {product.id.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                        {formatRupiah(product.price)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{product.stock}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                        {product.available}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                      </td>
                      <td className="relative px-4 py-3 text-right">
                        <button
                          type="button"
                          aria-label="Aksi produk"
                          onClick={() => setOpenMenu(openMenu === product.id ? null : product.id)}
                          className="rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenu === product.id && (
                          <div className="absolute right-4 top-11 z-20 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-left shadow-lg">
                            <Link
                              href={`/products/${product.id}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Lihat
                            </Link>
                            <button
                              type="button"
                              onClick={() => startEdit(product)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                            >
                              <Pencil className="h-4 w-4" />
                              Ubah
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(product)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Hapus
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ----------------------------------------------------- pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-600">
          <span>{filtered.length} produk</span>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              Baris per halaman
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded-lg border border-neutral-200 bg-white px-2 py-1 outline-none focus:border-neutral-400"
              >
                {[8, 16, 24].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span>
              Halaman {safePage} dari {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Halaman pertama"
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                className="rounded-lg border border-neutral-200 p-1.5 transition hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Halaman sebelumnya"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-neutral-200 p-1.5 transition hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Halaman berikutnya"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-neutral-200 p-1.5 transition hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Halaman terakhir"
                onClick={() => setPage(totalPages)}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-neutral-200 p-1.5 transition hover:bg-neutral-50 disabled:opacity-40"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
