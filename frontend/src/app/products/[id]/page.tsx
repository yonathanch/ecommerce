'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /** Units of this SKU still buyable (stock minus holds on this SKU). */
  available?: number
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
  /** Average and count of published reviews; both zero until one is published. */
  rating?: { average: number; count: number }
}

interface Review {
  id: string
  rating: number
  title: string | null
  body: string
  reply: string | null
  createdAt: string
  author: string
}

interface ReviewSummary {
  count: number
  average: number
  distribution: Record<number, number>
}

/** A buyer's own review of any status, as /reviews/product/:id/state returns it. */
interface MyReview {
  id: string
  rating: number
  title: string | null
  body: string
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED'
  reply: string | null
  createdAt: string
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
  const { addToCart, error: cartError, clearError: clearCartError } = useCart()

  // The status banner floats over the buy controls, so a note that never
  // clears would keep the quantity stepper unreachable — dismiss it instead.
  useEffect(() => {
    if (!message && !error && !cartError) return
    const timer = setTimeout(() => {
      setMessage('')
      setError('')
      clearCartError()
    }, 4000)
    return () => clearTimeout(timer)
  }, [message, error, cartError, clearCartError])

  // ------------------------------------------------------------- ulasan
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null)
  const [myReview, setMyReview] = useState<MyReview | null>(null)
  const [canReview, setCanReview] = useState(false)
  const [reviewReason, setReviewReason] = useState<string | null>(null)
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, title: '', body: '' })
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')

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

  const loadReviews = useCallback(async () => {
    try {
      const res = await apiClient.get(`/reviews/product/${id}`)
      setReviews(res.data.items ?? [])
      setReviewSummary(res.data.summary ?? null)
    } catch {
      // The list is decorative here; the product itself already loaded.
    }
  }, [id])

  useEffect(() => {
    void loadReviews()
  }, [loadReviews])

  // "May I review this?" — only asked when signed in, and only the answer of
  // the server counts: it is the same eligibility check the POST enforces.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage.getItem('token')) return
    apiClient
      .get(`/reviews/product/${id}/state`)
      .then((res) => {
        setCanReview(Boolean(res.data?.canReview))
        setReviewReason(res.data?.reason ?? null)
        setMyReview(res.data?.review ?? null)
      })
      .catch(() => {})
  }, [id])

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault()
    setReviewError('')
    setReviewNotice('')
    if (reviewDraft.body.trim().length < 5) {
      setReviewError('Tulis ulasan minimal 5 huruf.')
      return
    }
    setReviewBusy(true)
    try {
      await apiClient.post(`/reviews/product/${id}`, {
        rating: reviewDraft.rating,
        title: reviewDraft.title.trim() || undefined,
        body: reviewDraft.body.trim(),
      })
      setCanReview(false)
      setReviewDraft({ rating: 5, title: '', body: '' })
      setReviewNotice(
        'Terima kasih! Ulasan Anda dikirim dan menunggu moderasi toko sebelum tayang.',
      )
      // The author may see their own row immediately, still pending.
      const state = await apiClient.get(`/reviews/product/${id}/state`)
      setMyReview(state.data?.review ?? null)
      setReviewReason(state.data?.reason ?? null)
    } catch (e: any) {
      setReviewError(e?.response?.data?.message ?? 'Gagal mengirim ulasan')
    } finally {
      setReviewBusy(false)
    }
  }

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
  // A variant line is capped by that SKU's own availability; without a variant,
  // fall back to the product-level availability.
  const variantAvailable = selectedVariant?.available ?? selectedVariant?.stock
  const productAvailable = product?.available ?? 0
  const maxQuantity = axes.length > 0 ? (variantAvailable ?? 0) : productAvailable
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
    // A variant product must resolve to one specific SKU before it can be
    // carted — that SKU's stock and price are what the line holds.
    if (axes.length > 0 && !selectedVariant) {
      setError('Pilih varian yang tersedia terlebih dahulu.')
      return
    }
    const result = await addToCart(id, quantity, selectedVariant?.sku)
    if (result.ok) {
      setMessage(
        `${quantity} × ${product?.name}${selectedVariant ? ` (${axes.map((a) => selected[a]).filter(Boolean).join(', ')})` : ''} masuk ke keranjang`,
      )
    } else {
      setError(result.error ?? 'Gagal menambah ke keranjang')
    }
  }

  /** Buy now: add to cart then jump straight to checkout. */
  const handleBuyNow = async () => {
    setError('')
    setMessage('')
    if (requireSignIn()) return
    if (axes.length > 0 && !selectedVariant) {
      setError('Pilih varian yang tersedia terlebih dahulu.')
      return
    }
    setBuying(true)
    const result = await addToCart(id, quantity, selectedVariant?.sku)
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
                        ? 'border-blue-600'
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
            <span className="flex items-center gap-1">
              <Star
                className={`h-4 w-4 ${
                  (product.rating?.count ?? 0) > 0 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                }`}
              />
              {(product.rating?.count ?? 0) > 0 ? (
                <>
                  <span className="font-medium text-gray-700">
                    {product.rating!.average.toFixed(1)}
                  </span>{' '}
                  ({product.rating!.count} ulasan)
                </>
              ) : (
                <span>Belum ada ulasan</span>
              )}
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
                          ? 'border-blue-600 bg-blue-50 font-medium text-blue-700'
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
              Kategori: <span className="font-medium text-blue-600">{product.category}</span>
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
                  className="h-11 w-full bg-blue-600 text-base font-semibold hover:bg-blue-700"
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  + Keranjang
                </Button>
                <Button
                  onClick={handleBuyNow}
                  disabled={soldOut || buying}
                  variant="outline"
                  className="h-11 w-full border-blue-600 text-base font-semibold text-blue-700 hover:bg-blue-50"
                >
                  {buying ? 'Memproses…' : 'Beli Langsung'}
                </Button>
              </div>

              {/* aksi sekunder */}
              <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4 text-sm text-gray-600">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 transition hover:text-blue-700"
                >
                  <MessageCircle className="h-4 w-4" /> Chat
                </button>
                <span className="text-gray-200">|</span>
                <button
                  type="button"
                  onClick={handleWishlist}
                  disabled={wishlistBusy}
                  className={`flex items-center gap-1.5 rounded px-2 py-1.5 transition hover:text-blue-700 ${
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
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 transition hover:text-blue-700"
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

      {/* --------------------------------------------------------- ulasan */}
      <section className="mt-10 border-t pt-8" aria-label="Ulasan produk">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
          {/* ringkasan rating */}
          <div className="lg:self-start">
            <h2 className="text-lg font-semibold text-gray-900">Ulasan Pembeli</h2>
            {reviewSummary && reviewSummary.count > 0 ? (
              <>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-gray-900">
                    {reviewSummary.average.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-4 w-4 ${
                          star <= Math.round(reviewSummary.average)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-200'
                        }`}
                      />
                    ))}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Dari {reviewSummary.count} ulasan
                </p>
                <div className="mt-4 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const n = reviewSummary.distribution[star] ?? 0
                    const pct = reviewSummary.count ? (n / reviewSummary.count) * 100 : 0
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="w-3 text-right tabular-nums">{star}</span>
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <span
                            className="block h-full rounded-full bg-yellow-400"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-6 text-right tabular-nums">{n}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Belum ada ulasan tayang untuk produk ini.
              </p>
            )}

            {/* form ulasan pembeli */}
            <div className="mt-6 rounded-lg border border-gray-200 p-4">
              {reviewNotice ? (
                <p className="text-sm leading-relaxed text-green-700">{reviewNotice}</p>
              ) : myReview ? (
                <>
                  <p className="text-sm font-medium text-gray-900">Ulasan Anda</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {myReview.status === 'PENDING' &&
                      'Menunggu moderasi toko — belum tayang untuk pembeli lain.'}
                    {myReview.status === 'PUBLISHED' && 'Ulasan Anda sudah tayang.'}
                    {myReview.status === 'REJECTED' &&
                      'Ulasan Anda tidak lolos moderasi toko.'}
                  </p>
                  {myReview.reply && (
                    <p className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
                      Balasan toko: {myReview.reply}
                    </p>
                  )}
                </>
              ) : canReview ? (
                <form onSubmit={submitReview} className="space-y-3">
                  <p className="text-sm font-medium text-gray-900">Tulis ulasan</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        aria-label={`Beri ${star} bintang`}
                        onClick={() => setReviewDraft((d) => ({ ...d, rating: star }))}
                      >
                        <Star
                          className={`h-5 w-5 transition ${
                            star <= reviewDraft.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300 hover:text-yellow-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <input
                    value={reviewDraft.title}
                    onChange={(e) => setReviewDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Ringkasan (opsional)"
                    maxLength={120}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                  />
                  <textarea
                    value={reviewDraft.body}
                    onChange={(e) => setReviewDraft((d) => ({ ...d, body: e.target.value }))}
                    placeholder="Ceritakan pengalaman Anda memakai produk ini…"
                    rows={4}
                    maxLength={2000}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
                  />
                  {reviewError && <p className="text-sm text-red-600">{reviewError}</p>}
                  <button
                    type="submit"
                    disabled={reviewBusy}
                    className="h-9 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {reviewBusy ? 'Mengirim…' : 'Kirim ulasan'}
                  </button>
                </form>
              ) : (
                <p className="text-sm leading-relaxed text-gray-500">
                  {reviewReason === 'NOT_PURCHASED'
                    ? 'Hanya pembeli yang sudah membeli produk ini yang dapat mengulasnya.'
                    : 'Masuk dengan akun pembeli Anda untuk mengulas produk ini.'}
                </p>
              )}
            </div>
          </div>

          {/* daftar ulasan tayang */}
          <div>
            {reviews.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Belum ada ulasan tayang.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {reviews.map((review) => (
                  <li key={review.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{review.author}</span>
                      <span className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3.5 w-3.5 ${
                              star <= review.rating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-200'
                            }`}
                          />
                        ))}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(review.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {review.title && (
                      <p className="mt-1.5 text-sm font-semibold text-gray-900">{review.title}</p>
                    )}
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{review.body}</p>
                    {review.reply && (
                      <div className="mt-2 rounded-md bg-gray-50 p-3">
                        <p className="text-xs font-semibold text-gray-700">Balasan toko</p>
                        <p className="mt-0.5 text-sm text-gray-600">{review.reply}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* pesan status */}
      {(message || error || cartError) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div
            className={`pointer-events-auto max-w-full rounded-lg px-4 py-3 text-sm shadow-lg ${
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
