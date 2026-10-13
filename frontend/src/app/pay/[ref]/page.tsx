'use client'

import { useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import apiClient from '@/lib/api-client'

/**
 * Sandbox gateway page (development only).
 *
 * With a real gateway this screen lives on the provider's domain; here the mock
 * provider points `paymentUrl` at this route so the whole flow can be walked
 * locally. The amount shown comes from the query string purely for display —
 * the authoritative amount lives in the payment record, and the backend rejects
 * any webhook whose amount disagrees with it.
 */
export default function MockPaymentPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const providerRef = String(params.ref ?? '')
  const amount = Number(searchParams.get('amount') ?? 0)
  const orderId = searchParams.get('order') ?? ''

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<'captured' | 'failed' | null>(null)

  const settle = async (outcome: 'captured' | 'failed') => {
    setBusy(true)
    setError('')
    try {
      await apiClient.post(`/payments/simulate/${providerRef}/${outcome}`)
      setResult(outcome)
      setTimeout(() => router.push('/orders'), 1200)
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message
      setError(message ?? 'Simulasi pembayaran gagal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border rounded-xl shadow-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
          Sandbox gateway (dev)
        </p>
        <h1 className="text-xl font-bold mb-1">Simulasi Pembayaran</h1>
        <p className="text-sm text-gray-500 mb-6">
          Halaman ini meniru halaman gateway. Di produksi, halaman pembayaran
          dimiliki oleh penyedia pembayaran.
        </p>

        <dl className="text-sm space-y-2 mb-6">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Reference</dt>
            <dd className="font-mono text-xs break-all text-right">{providerRef}</dd>
          </div>
          {orderId && (
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Order</dt>
              <dd className="font-mono text-xs">{orderId.slice(0, 8)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">Jumlah</dt>
            <dd className="font-semibold">{amount > 0 ? amount : '—'}</dd>
          </div>
        </dl>

        {result === 'captured' && (
          <p className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
            Pembayaran berhasil dikonfirmasi. Mengalihkan ke daftar pesanan…
          </p>
        )}
        {result === 'failed' && (
          <p className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            Pembayaran gagal dicatat. Mengalihkan ke daftar pesanan…
          </p>
        )}
        {error && (
          <p className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => settle('captured')}
            disabled={busy}
            className="flex-1 py-3 rounded font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
          >
            {busy ? 'Memproses…' : 'Bayar sekarang'}
          </button>
          <button
            onClick={() => settle('failed')}
            disabled={busy}
            className="px-4 py-3 rounded font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
          >
            Simulasikan gagal
          </button>
        </div>
      </div>
    </div>
  )
}
