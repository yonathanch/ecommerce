/** Single source of truth for money and dates on back-office screens. */
export const formatRupiah = (value: number | null | undefined) =>
  `Rp ${Math.round(value ?? 0).toLocaleString('id-ID')}`

export const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu bayar',
  PAID: 'Dibayar',
  SHIPPED: 'Dikirim',
  DELIVERED: 'Diterima',
  CANCELLED: 'Dibatalkan',
  REFUNDED: 'Direfund',
}

// Soft 10%-alpha pills on white, mirroring the template's Badge colours.
export const ORDER_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-600',
  PAID: 'bg-emerald-500/10 text-emerald-600',
  SHIPPED: 'bg-blue-500/10 text-blue-600',
  DELIVERED: 'bg-emerald-500/10 text-emerald-600',
  CANCELLED: 'bg-neutral-500/10 text-neutral-600',
  REFUNDED: 'bg-slate-500/10 text-slate-600',
}

/** Label for the admin button that performs a given transition. */
export const TRANSITION_LABELS: Record<string, string> = {
  SHIPPED: 'Tandai dikirim',
  DELIVERED: 'Tandai diterima',
  REFUNDED: 'Refund & kembalikan stok',
  CANCELLED: 'Batalkan pesanan',
}

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  DEDUCT: 'Pengurangan',
  RESTOCK: 'Pengembalian',
  ADJUST: 'Penyesuaian',
}

// Computed server-side from the same rules checkout enforces, so a coupon that
// looks usable here really is usable at payment.
export const COUPON_STATUS_LABELS: Record<string, string> = {
  AKTIF: 'Aktif',
  NONAKTIF: 'Nonaktif',
  KEDALUWARSA: 'Kedaluwarsa',
  HABIS: 'Kuota habis',
}

export const COUPON_STATUS_STYLES: Record<string, string> = {
  AKTIF: 'bg-emerald-500/10 text-emerald-600',
  NONAKTIF: 'bg-neutral-500/10 text-neutral-600',
  KEDALUWARSA: 'bg-amber-500/10 text-amber-600',
  HABIS: 'bg-rose-500/10 text-rose-600',
}
