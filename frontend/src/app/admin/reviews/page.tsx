'use client'

import { useMemo, useState } from 'react'
import { Flag, MessageSquareReply, Star, X } from 'lucide-react'
import { Panel, SearchBox, StatusPill } from '@/components/admin/ui'
import { adminReviews, type AdminReview, type AdminReviewStatus } from '@/lib/admin-mock'

/**
 * Reviews screen — UI ported from the OrbynAdmin e-commerce group.
 * Demo rows only; the review endpoints are wired in a later round.
 */
const TABS: Array<'Semua' | AdminReviewStatus> = ['Semua', 'Terbit', 'Menunggu', 'Dilaporkan']

const STATUS_TONE: Record<AdminReviewStatus, 'green' | 'amber' | 'rose'> = {
  Terbit: 'green',
  Menunggu: 'amber',
  Dilaporkan: 'rose',
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
  const [rows, setRows] = useState<AdminReview[]>(adminReviews)
  const [tab, setTab] = useState<'Semua' | AdminReviewStatus>('Semua')
  const [search, setSearch] = useState('')
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const summary = useMemo(() => {
    const total = rows.length
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    for (const row of rows) counts[row.rating] = (counts[row.rating] ?? 0) + 1
    const avg = total ? rows.reduce((sum, row) => sum + row.rating, 0) / total : 0
    return {
      total,
      avg,
      counts,
      byStatus: (status: AdminReviewStatus) => rows.filter((r) => r.status === status).length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesTab = tab === 'Semua' || row.status === tab
      const matchesSearch =
        !query ||
        row.author.toLowerCase().includes(query) ||
        row.product.toLowerCase().includes(query) ||
        row.body.toLowerCase().includes(query)
      return matchesTab && matchesSearch
    })
  }, [rows, tab, search])

  const setStatus = (id: string, status: AdminReviewStatus) =>
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))

  const sendReply = (id: string) => {
    const text = replyText.trim()
    if (!text) return
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, reply: text } : row)))
    setReplyingId(null)
    setReplyText('')
  }

  const tiles = [
    { label: 'Total ulasan', value: summary.total },
    { label: 'Terbit', value: summary.byStatus('Terbit') },
    { label: 'Menunggu', value: summary.byStatus('Menunggu') },
    { label: 'Dilaporkan', value: summary.byStatus('Dilaporkan') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Ulasan</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Moderasi ulasan pelanggan dan balas pembeli Anda.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-white px-4 py-4 ring-1 ring-neutral-900/10">
            <p className="text-sm text-neutral-500">{tile.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------- rating summary */}
        <Panel title="Ringkasan rating" subtitle="Dari seluruh produk" className="lg:self-start">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-5xl font-semibold tracking-tight tabular-nums text-neutral-900">
              {summary.avg.toFixed(1)}
            </span>
            <Stars rating={Math.round(summary.avg)} size="h-5 w-5" />
            <p className="text-sm text-neutral-500">
              Berdasarkan {summary.total} ulasan
            </p>
          </div>

          <div className="mt-6 space-y-2.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = summary.counts[star] ?? 0
              const pct = summary.total ? (count / summary.total) * 100 : 0
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
          subtitle={`${filtered.length} ulasan ditampilkan`}
          className="lg:col-span-2"
          action={<SearchBox placeholder="Cari ulasan…" className="w-56" />}
          bodyClassName="px-5 pb-5 pt-4"
        >
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TABS.map((value) => (
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
            {filtered.map((review) => (
              <div key={review.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-neutral-900">{review.author}</span>
                  <span className="text-xs text-neutral-500">di {review.product}</span>
                  <span className="ml-auto">
                    <StatusPill tone={STATUS_TONE[review.status]}>{review.status}</StatusPill>
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Stars rating={review.rating} />
                  <span className="text-xs tabular-nums text-neutral-400">{review.date}</span>
                </div>

                <p className="mt-2 text-sm font-medium text-neutral-900">{review.title}</p>
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
                      placeholder={`Balas ${review.author}…`}
                      rows={3}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-400/40"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => sendReply(review.id)}
                        className="h-7 rounded-lg bg-neutral-900 px-2.5 text-xs font-medium text-white transition hover:bg-neutral-900/80"
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
                  {review.status !== 'Terbit' && (
                    <button
                      type="button"
                      onClick={() => setStatus(review.id, 'Terbit')}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
                    >
                      <Star className="h-3.5 w-3.5" />
                      Setujui
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingId(review.id)
                      setReplyText(review.reply ?? '')
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    <MessageSquareReply className="h-3.5 w-3.5" />
                    {review.reply ? 'Ubah balasan' : 'Balas'}
                  </button>
                  {review.status !== 'Dilaporkan' && (
                    <button
                      type="button"
                      onClick={() => setStatus(review.id, 'Dilaporkan')}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100"
                    >
                      <Flag className="h-3.5 w-3.5" />
                      Tandai
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
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
