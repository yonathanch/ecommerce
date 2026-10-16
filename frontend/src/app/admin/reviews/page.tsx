'use client'

import { useCallback, useEffect, useState } from 'react'
import { Flag, MessageSquareReply, Star, Trash2, X } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { Panel, StatusPill } from '@/components/admin/ui'

/**
 * Reviews moderation — wired to the real endpoints.
 *
 * A review arrives as PENDING and is invisible to shoppers until it is
 * published here, which is the whole point of the queue: the product page and
 * this screen read the same rows, so "Setujui" really is what puts a review on
 * the storefront and "Tolak" really is what keeps it off.
 */
type Tab = 'Semua' | 'Menunggu' | 'Terbit' | 'Ditolak'

const TAB_STATUS: Record<Exclude<Tab, 'Semua'>, 'PENDING' | 'PUBLISHED' | 'REJECTED'> = {
  Menunggu: 'PENDING',
  Terbit: 'PUBLISHED',
  Ditolak: 'REJECTED',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  PUBLISHED: 'Terbit',
  REJECTED: 'Ditolak',
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'rose'> = {
  PENDING: 'amber',
  PUBLISHED: 'green',
  REJECTED: 'rose',
}

interface ReviewRow {
  id: string
  rating: number
  title: string | null
  body: string
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED'
  reply: string | null
  createdAt: string
  author: { id: string; name: string; email: string }
  product: { id: string; name: string }
}

interface ReviewSummary {
  total: number
  pending: number
  published: number
  rejected: number
  average: number
  ratingCount: number
  distribution: Record<number, number>
}

const errorMessage = (e: any, fallback: string) => {
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join(', ') : message ?? fallback
}

function Stars({ rating, size = 'h-3.5 w-3.5' }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${size} ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`}
        />
      ))}
    </span>
  )
}

export default function AdminReviewsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [tab, setTab] = useState<Tab>('Semua')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tab !== 'Semua') params.set('status', TAB_STATUS[tab])
      if (query) params.set('search', query)
      const suffix = params.toString()
      const res = await apiClient.get(`/admin/reviews${suffix ? `?${suffix}` : ''}`)
      setRows(res.data.items ?? [])
      setSummary(res.data.summary ?? null)
      setError('')
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memuat ulasan'))
    } finally {
      setLoading(false)
    }
  }, [tab, query])

  useEffect(() => {
    void load()
  }, [load])

  /** Publish, reject, or answer a review — the same PATCH the queue buttons use. */
  const moderate = async (id: string, patch: { status?: string; reply?: string | null }) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.patch(`/admin/reviews/${id}`, patch)
      if (patch.status === 'PUBLISHED') setNotice('Ulasan diterbitkan — langsung tayang di halaman produk.')
      else if (patch.status === 'REJECTED') setNotice('Ulasan ditolak — tidak tayang untuk pembeli.')
      else if (patch.status === 'PENDING') setNotice('Ulasan dikembalikan ke antrean moderasi.')
      else setNotice('Balasan toko disimpan.')
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal memperbarui ulasan'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (review: ReviewRow) => {
    if (!window.confirm(`Hapus ulasan ${review.author.name} untuk "${review.product.name}"? Tindakan ini tidak bisa dibatalkan.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await apiClient.delete(`/admin/reviews/${review.id}`)
      setNotice('Ulasan dihapus permanen.')
      await load()
    } catch (e: any) {
      setError(errorMessage(e, 'Gagal menghapus ulasan'))
    } finally {
      setBusy(false)
    }
  }

  const sendReply = (review: ReviewRow) => {
    const text = replyText.trim()
    setReplyingId(null)
    setReplyText('')
    void moderate(review.id, { reply: text || null })
  }

  const tiles = [
    { label: 'Total ulasan', value: summary?.total ?? 0 },
    { label: 'Menunggu moderasi', value: summary?.pending ?? 0 },
    { label: 'Tayang', value: summary?.published ?? 0 },
    { label: 'Ditolak', value: summary?.rejected ?? 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ulasan</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Setiap ulasan baru masuk sebagai <strong>Menunggu</strong> dan belum terlihat pembeli lain
            sampai Anda menerbitkannya di sini.
          </p>
        </div>
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
            placeholder="Cari ulasan, produk, pembeli…"
            className="h-9 w-64 rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          />
          <button
            type="submit"
            className="h-9 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
          >
            Cari
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------- rating summary */}
        <Panel title="Ringkasan rating" subtitle="Dari ulasan yang tayang" className="lg:self-start">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-5xl font-semibold tracking-tight tabular-nums text-neutral-900">
              {(summary?.average ?? 0).toFixed(1)}
            </span>
            <Stars rating={Math.round(summary?.average ?? 0)} size="h-5 w-5" />
            <p className="text-sm text-neutral-500">
              Berdasarkan {summary?.ratingCount ?? 0} ulasan tayang
            </p>
          </div>

          <div className="mt-6 space-y-2.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary?.distribution?.[star] ?? 0
              const published = summary?.ratingCount ?? 0
              const pct = published ? (count / published) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-3 text-sm">
                  <span className="flex w-8 items-center gap-1 tabular-nums text-neutral-500">
                    {star}
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums text-neutral-500">{count}</span>
                </div>
              )
            })}
          </div>

        </Panel>

        {/* ------------------------------------------------------ reviews list */}
        <Panel
          title="Semua ulasan"
          subtitle={`${rows.length} ulasan ditampilkan`}
          className="lg:col-span-2"
          bodyClassName="px-5 pb-5 pt-4"
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            {(['Semua', 'Menunggu', 'Terbit', 'Ditolak'] as Tab[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === value
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="divide-y divide-neutral-100">
            {loading ? (
              <p className="py-10 text-center text-sm text-neutral-500">Memuat…</p>
            ) : (
              rows.map((review) => (
                <div key={review.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-neutral-900">{review.author.name}</span>
                    <span className="text-xs text-neutral-500">di {review.product.name}</span>
                    <span className="ml-auto">
                      <StatusPill tone={STATUS_TONE[review.status]}>
                        {STATUS_LABEL[review.status]}
                      </StatusPill>
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <span className="text-xs tabular-nums text-neutral-400">
                      {formatDateTime(review.createdAt)}
                    </span>
                  </div>

                  {review.title && (
                    <p className="mt-2 text-sm font-medium text-neutral-900">{review.title}</p>
                  )}
                  <p className="mt-1 text-sm text-neutral-600">{review.body}</p>

                  {review.reply && replyingId !== review.id && (
                    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-700">
                        <MessageSquareReply className="h-3.5 w-3.5" />
                        Balasan toko
                      </p>
                      <p className="text-sm text-neutral-600">{review.reply}</p>
                    </div>
                  )}

                  {replyingId === review.id && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder={`Balas ${review.author.name}…`}
                        rows={3}
                        maxLength={1000}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => sendReply(review)}
                          className="h-7 rounded-lg bg-neutral-900 px-2.5 text-xs font-medium text-white transition hover:bg-neutral-900/80 disabled:opacity-40"
                        >
                          Kirim balasan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingId(null)
                            setReplyText('')
                          }}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.status !== 'PUBLISHED' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void moderate(review.id, { status: 'PUBLISHED' })}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
                      >
                        <Star className="h-3.5 w-3.5" />
                        Terbitkan
                      </button>
                    )}
                    {review.status !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void moderate(review.id, { status: 'REJECTED' })}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        Tolak
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setReplyingId(review.id)
                        setReplyText(review.reply ?? '')
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
                    >
                      <MessageSquareReply className="h-3.5 w-3.5" />
                      {review.reply ? 'Ubah balasan' : 'Balas'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(review)}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}

            {!loading && rows.length === 0 && (
              <div className="py-14 text-center text-sm text-neutral-500">
                <X className="mx-auto mb-2 h-6 w-6 opacity-40" />
                Tidak ada ulasan yang cocok dengan filter Anda.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
