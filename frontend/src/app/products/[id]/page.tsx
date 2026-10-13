'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import apiClient from '@/lib/api-client'
import { useCart } from '@/lib/cart-service'
import { formatRupiah } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  ChevronRight,
  Heart,
  Minus,
  MessageCircle,
  Plus,
  Share2,
  ShoppingCart,
  Star,
} from 'lucide-react'

interface Variant {
  id: string
  sku: string
  options: { color?: string; size?: string } & Record<string, string>
  price: number | null
  stock: number
  imageUrl: string | null
}

interface ProductDetail {
  id: string
  name: string
  description?: string | null
  price: number
  stock: number
  available: number
  reserved?: number
  category: string
  images: { url: string; alt: string | null }[]
  variants: Variant[]
}

/** Variant axes present on this product, in stable display order. */
function variantAxes(variants: Variant[]): string[] {
  const axes: string[] = []
  for (const variant of variants) {
    for (const key of Object.keys(variant.options ?? {})) {
      if (!axes.includes(key)) axes.push(key)
    }
  }
  return axes
}

export default function ProductDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [selectedImage, setSelectedImage] = useState(0)
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [inWishlist, setInWishlist] = useState(false)
  const [wishlistBusy, setWishlistBusy] = useState(false)
  const [buying, setBuying] = useState(false)
  const { addToCart, error: cartError } = useCart()

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get(`/products/${id}`)
        setProduct(res.data)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage.getItem('token')) return
    apiClient
      .get('/wishlist')
      .then((res) => {
        const items: { productId: string }[] = res.data ?? []
        setInWishlist(items.some((item) => item.productId === id))
      })
      .catch(() => {})
  }, [id])

  const axes = useMemo(() => variantAxes(product?.variants ?? []), [product])

  // When the product loads (or the variant axis set changes), preselect the
  // first option of every axis so the summary card is never empty.
  useEffect(() => {
    if (axes.length === 0) return
    setSelected(() => {
      const next: Record<string, string> = {}
      for (const axis of axes) {
        const first = product?.variants.find((v) => v.options?.[axis])?.options?.[axis]
        if (first) next[axis] = first
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, axes.join('|')])

  /** The variant matching every selected option, if one exists. */
  const selectedVariant = useMemo(() => {
    if (!product || axes.length === 0) return null
    return (
      product.variants.find((v) =>
        axes.every((axis) => (v.options?.[axis] ?? '') === (selected[axis] ?? '')),
      ) ?? null
    )
  }, [product, axes, selected])

  /** Options per axis, hiding combinations that do not exist for other axes. */
  const optionsByAxis = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const axis of axes) {
      const seen: string[] = []
      for (const variant of product?.variants ?? []) {
        const value = variant.options?.[axis]
        if (!value) continue
        const othersMatch = axes
          .filter((a) => a !== axis)
          .every((a) => !selected[a] || (variant.options?.[a] ?? '') === selected[a])
        if (othersMatch && !seen.includes(value)) seen.push(value)
      }
      map.set(axis, seen)
    }
    return map
  }, [product, axes, selected])

  const activePrice = selectedVariant?.price ?? product?.price ?? 0
  const variantStock = selectedVariant?.stock
  const productAvailable = product?.available ?? 0
  // Variant stock is per-SKU; without a variant, fall back to product availability.
  const maxQuantity = variantStock ?? productAvailable
  const soldOut = maxQuantity <= 0

  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), Math.max(maxQuantity, 1)))
  }, [maxQuantity])

  const subtotal = activePrice * quantity

  const requireSignIn = () => {
    if (typeof window !== 'undefined' && !window.localStorage.getItem('token')) {
      setError('Silakan masuk untuk melanjutkan.')
      return true
    }
    return false
  }

  const handleAddToCart = async () => {
    setError('')
    setMessage('')
    if (requireSignIn()) return
    const result = await addToCart(id, quantity)
    if (result.ok) {
      setMessage(`${quantity} × ${product?.name} masuk ke keranjang`)
    } else {
      setError(result.error ?? 'Gagal menambah ke keranjang')
    }
  }

  /** Buy now: add to cart then jump straight to checkout. */
  const handleBuyNow = async () => {
    setError('')
    setMessage('')
    if (requireSignIn()) return
    setBuying(true)
    const result = await addToCart(id, quantity)
    if (result.ok) {
      window.location.href = '/checkout'
    } else {
      setError(result.error ?? 'Gagal menambah ke keranjang')
      setBuying(false)
    }
  }

  const handleWishlist = async () => {
    setError('')
    if (requireSignIn()) return
    setWishlistBusy(true)
    try {
      const res = await apiClient.post(`/wishlist/items/${id}/toggle`)
      setInWishlist(Boolean(res.data?.added))
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal memperbarui wishlist')
    } finally {
      setWishlistBusy(false)
    }
  }

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) {
        await navigator.share({ title: product?.name, url })
      } else {
        await navigator.clipboard.writeText(url)
        setMessage('Link produk disalin')
      }
    } catch {
      // user cancelled share
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[420px_1fr_320px]">
          <div className="aspect-square animate-pulse rounded-lg bg-gray-100" />
          <div className="space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-40 animate-pulse rounded bg-gray-100" />
            <div className="h-24 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="hidden h-96 animate-pulse rounded-lg bg-gray-100 md:block" />
        </div>
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="mx-auto max-w-6xl p-10 text-center">
        <p className="mb-4 text-lg font-medium text-gray-700">Produk tidak ditemukan</p>
        <Link
          href="/products"
          className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Kembali ke daftar produk
        </Link>
      </div>
    )
  }

  const images = product.images?.length
    ? product.images.map((i) => i.url)
    : selectedVariant?.imageUrl
      ? [selectedVariant.imageUrl]
      : []

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr_320px] lg:gap-8">
        {/* ---------------------------------------------------- galeri foto */}
        <div>
          <div className="aspect-square overflow-hidden rounded-lg border bg-gray-50">
            {images[selectedImage] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[selectedImage]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                Tidak ada gambar
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="relative mt-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((url, index) => (
                  <button
                    key={url + index}
                    type="button"
                    onClick={() => setSelectedImage(index)}
                    aria-label={`Lihat foto ${index + 1}`}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 transition ${
                      index === selectedImage
                        ? 'border-green-600'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------- info + varian */}
        <div>
          <h1 className="text-xl font-semibold leading-snug text-gray-900 sm:text-2xl">
            {product.name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <span>
              Terjual <span className="font-medium text-gray-700">100 rb+</span>
            </span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-gray-700">4.6</span> (15,2rb rating)
            </span>
          </div>

          <div className="mt-4 border-b pb-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-bold text-gray-900">{formatRupiah(activePrice)}</span>
              {selectedVariant?.price != null && selectedVariant.price !== product.price && (
                <>
                  <Badge variant="destructive">Diskon</Badge>
                  <span className="text-sm text-gray-400 line-through">
                    {formatRupiah(product.price)}
                  </span>
                </>
              )}
            </div>
          </div>

          {axes.map((axis) => (
            <div key={axis} className="mt-5">
              <p className="mb-2 text-sm">
                <span className="text-gray-500">Pilih {axis}: </span>
                <span className="font-medium capitalize text-gray-900">{selected[axis] ?? '-'}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {(optionsByAxis.get(axis) ?? []).map((value) => {
                  const isActive = selected[axis] === value
                  const optionVariant = product.variants.find(
                    (v) =>
                      v.options?.[axis] === value &&
                      axes
                        .filter((a) => a !== axis)
                        .every((a) => !selected[a] || (v.options?.[a] ?? '') === selected[a]),
                  )
                  const outOfStock = (optionVariant?.stock ?? 0) <= 0
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => setSelected((prev) => ({ ...prev, [axis]: value }))}
                      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                        isActive
                          ? 'border-green-600 bg-green-50 font-medium text-green-700'
                          : 'border-gray-200 text-gray-700 hover:border-gray-400'
                      } ${outOfStock ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      {optionVariant?.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={optionVariant.imageUrl}
                          alt=""
                          className="h-6 w-6 rounded object-cover"
                        />
                      )}
                      {value}
                      {outOfStock && <span className="text-xs">(habis)</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="mt-6 border-t pt-4">
            <p className="text-sm text-gray-500">
              Kondisi: <span className="font-medium text-gray-900">Baru</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Kategori: <span className="font-medium text-green-700">{product.category}</span>
            </p>
            {product.description && (
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{product.description}</p>
            )}
          </div>
        </div>

        {/* ------------------------------------- atur jumlah dan catatan */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Atur jumlah dan catatan
              </h2>

              {/* ringkasan varian terpilih */}
              <div className="mb-4 flex items-center gap-3 border-b pb-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-gray-100">
                  {(selectedVariant?.imageUrl || images[0]) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedVariant?.imageUrl ?? images[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {axes.length > 0
                      ? axes.map((a) => selected[a]).filter(Boolean).join(', ')
                      : product.name}
                  </p>
                </div>
              </div>

              {/* stepper jumlah + stok */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center rounded-lg border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Kurangi jumlah"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={maxQuantity || 1}
                    value={quantity}
                    onChange={(e) => {
                      const next = parseInt(e.target.value) || 1
                      setQuantity(Math.min(Math.max(1, next), Math.max(maxQuantity, 1)))
                    }}
                    className="h-9 w-14 border-0 text-center [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Tambah jumlah"
                    disabled={soldOut || quantity >= maxQuantity}
                    onClick={() => setQuantity((q) => Math.min(q + 1, maxQuantity))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-500">
                  Stok: <span className="font-semibold text-gray-900">{maxQuantity}</span>
                </p>
              </div>

              {/* subtotal */}
              <div className="mb-5 border-t pt-4">
                {quantity > 1 && (
                  <p className="mb-1 text-right text-xs text-gray-400">
                    {formatRupiah(activePrice)} × {quantity}
                  </p>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {formatRupiah(subtotal)}
                  </span>
                </div>
              </div>

              {/* aksi utama */}
              <div className="space-y-3">
                <Button
                  onClick={handleAddToCart}
                  disabled={soldOut}
                  className="h-11 w-full bg-green-600 text-base font-semibold hover:bg-green-700"
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  + Keranjang
                </Button>
                <Button
                  onClick={handleBuyNow}
                  disabled={soldOut || buying}
                  variant="outline"
                  className="h-11 w-full border-green-600 text-base font-semibold text-green-700 hover:bg-green-50"
                >
                  {buying ? 'Memproses…' : 'Beli Langsung'}
                </Button>
              </div>

              {/* aksi sekunder */}
              <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4 text-sm text-gray-600">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 transition hover:text-green-700"
                >
                  <MessageCircle className="h-4 w-4" /> Chat
                </button>
                <span className="text-gray-200">|</span>
                <button
                  type="button"
                  onClick={handleWishlist}
                  disabled={wishlistBusy}
                  className={`flex items-center gap-1.5 rounded px-2 py-1.5 transition hover:text-green-700 ${
                    inWishlist ? 'text-red-600' : ''
                  }`}
                >
                  <Heart className={`h-4 w-4 ${inWishlist ? 'fill-red-500 text-red-500' : ''}`} />
                  Wishlist
                </button>
                <span className="text-gray-200">|</span>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 transition hover:text-green-700"
                >
                  <Share2 className="h-4 w-4" /> Share
                </button>
              </div>
            </CardContent>
          </Card>

          {typeof product.reserved === 'number' && product.reserved > 0 && (
            <p className="mt-3 text-xs text-gray-400">
              {product.reserved} unit sedang ditahan pesanan yang belum dibayar.
            </p>
          )}
        </div>
      </div>

      {/* pesan status */}
      {(message || error || cartError) && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div
            className={`rounded-lg px-4 py-3 text-sm shadow-lg ${
              error || cartError
                ? 'bg-red-600 text-white'
                : 'bg-green-600 text-white'
            }`}
          >
            {error || cartError || message}
            {message && (
              <Link href="/checkout" className="ml-2 underline font-semibold">
                Ke checkout
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
