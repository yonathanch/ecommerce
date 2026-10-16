'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import apiClient from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'

/**
 * The back-office notification feed.
 *
 * Reads `/notifications`, which is scoped to the signed-in user — an admin sees
 * exactly the rows `notifyAdmins()` wrote for them, nothing borrowed from
 * another admin. Rows are only clickable when their `meta` names an entity this
 * back-office actually has a screen for; an unlinked row stays text rather than
 * sending the admin to a page that cannot show it.
 */

interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
  meta?: Record<string, unknown> | null
}

/** Label + tone per notification type, so the list reads at a glance. */
const TYPES: Record<string, { label: string; tone: string }> = {
  ORDER_CREATED: { label: 'Pesanan baru', tone: 'bg-blue-500/10 text-blue-600' },
  ORDER_PAID: { label: 'Pembayaran diterima', tone: 'bg-emerald-500/10 text-emerald-600' },
  ORDER_SHIPPED: { label: 'Dikirim', tone: 'bg-blue-500/10 text-blue-600' },
  ORDER_DELIVERED: { label: 'Diterima', tone: 'bg-emerald-500/10 text-emerald-600' },
  ORDER_CANCELLED: { label: 'Dibatalkan', tone: 'bg-neutral-500/10 text-neutral-600' },
  ORDER_REFUNDED: { label: 'Refund', tone: 'bg-slate-500/10 text-slate-600' },
  PAYMENT_FAILED: { label: 'Pembayaran gagal', tone: 'bg-rose-500/10 text-rose-600' },
  RESERVATION_EXPIRED: { label: 'Hold kedaluwarsa', tone: 'bg-amber-500/10 text-amber-600' },
  LOW_STOCK: { label: 'Stok menipis', tone: 'bg-amber-500/10 text-amber-600' },
  REVIEW_SUBMITTED: { label: 'Ulasan menunggu', tone: 'bg-blue-500/10 text-blue-600' },
  REVIEW_PUBLISHED: { label: 'Ulasan tayang', tone: 'bg-emerald-500/10 text-emerald-600' },
  REVIEW_REJECTED: { label: 'Ulasan ditolak', tone: 'bg-rose-500/10 text-rose-600' },
}

/** Where a notification leads, when the back-office has a screen for it. */
function targetFor(row: NotificationRow): string | null {
  const meta = row.meta ?? {}
  if (typeof meta.orderId === 'string') return `/admin/orders?focus=${meta.orderId}`
  // A restock alert belongs on the product it names, where stock is edited.
  if (typeof meta.productId === 'string') return `/admin/products?focus=${meta.productId}`
  // Reviews have a moderation queue but no per-review route; the queue is the
  // screen that owns them.
  if (typeof meta.reviewId === 'string') return '/admin/reviews'
  return null
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const wrapper = useRef<HTMLDivElement | null>(null)

  const loadFeed = useCallback(async () => {
    setLoading(true)
    try {
      const [list, count] = await Promise.all([
        apiClient.get('/notifications'),
        apiClient.get('/notifications/unread-count'),
      ])
      setRows(Array.isArray(list.data) ? list.data : [])
      setUnread(count.data?.count ?? 0)
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal memuat notifikasi')
    } finally {
      setLoading(false)
    }
  }, [])

  // The badge must be right without the panel ever being opened, so the count is
  // polled and refreshed whenever the tab regains focus.
  const refreshCount = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications/unread-count')
      setUnread(res.data?.count ?? 0)
    } catch {
      // A failed poll leaves the last known count alone; the panel reports errors.
    }
  }, [])

  useEffect(() => {
    void refreshCount()
    const timer = setInterval(() => void refreshCount(), 60_000)
    const onFocus = () => void refreshCount()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshCount])

  // Close on outside click / Escape, like the other panels in this shell.
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) void loadFeed()
  }

  const openRow = async (row: NotificationRow) => {
    setBusyId(row.id)
    try {
      if (!row.readAt) {
        await apiClient.post(`/notifications/${row.id}/read`)
        setRows((prev) =>
          prev.map((item) =>
            item.id === row.id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
          ),
        )
        setUnread((count) => Math.max(0, count - 1))
      }
      const href = targetFor(row)
      if (href) {
        setOpen(false)
        router.push(href)
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal menandai notifikasi')
    } finally {
      setBusyId(null)
    }
  }

  const markAll = async () => {
    try {
      await apiClient.post('/notifications/read-all')
      const now = new Date().toISOString()
      setRows((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? now })))
      setUnread(0)
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Gagal menandai semua notifikasi')
    }
  }

  const badge = unread > 99 ? '99+' : String(unread)

  return (
    <div className="relative" ref={wrapper}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-100"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span
            data-testid="admin-unread-count"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifikasi"
          className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-900/10"
        >
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-neutral-900">Notifikasi</p>
              <p className="text-xs text-neutral-500">
                {unread > 0 ? `${unread} belum dibaca` : 'Semua sudah dibaca'}
              </p>
            </div>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" />
              Tandai semua
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">Memuat…</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">
                Belum ada notifikasi. Pesanan baru, stok menipis, dan ulasan yang masuk akan muncul
                di sini.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {rows.map((row) => {
                  const type = TYPES[row.type] ?? { label: row.type, tone: 'bg-neutral-500/10 text-neutral-600' }
                  const href = targetFor(row)
                  const unreadRow = !row.readAt
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => void openRow(row)}
                        disabled={busyId === row.id}
                        className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 ${
                          unreadRow ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${type.tone}`}
                        >
                          {type.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span
                              className={`min-w-0 flex-1 text-sm ${
                                unreadRow ? 'font-medium text-neutral-900' : 'text-neutral-700'
                              }`}
                            >
                              {row.title}
                            </span>
                            {unreadRow && (
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-blue-600" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
                            {row.body}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
                            {formatDateTime(row.createdAt)}
                            {href && <span className="text-neutral-500 underline">Buka</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && (
            <p className="border-t border-neutral-100 bg-rose-50 px-4 py-2 text-xs text-rose-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
