'use client'

import { Panel, SearchBox, StatusPill } from '@/components/admin/ui'
import { adminShipments } from '@/lib/admin-mock'

const TONE: Record<string, 'blue' | 'amber' | 'green' | 'slate'> = {
  'Dalam perjalanan': 'blue',
  'Dikirim': 'blue',
  Terkirim: 'green',
  'Menunggu pickup': 'amber',
}

/**
 * Shipping screen — UI ported from the OrbynAdmin e-commerce group.
 * Demo rows only; fulfillment/DB wiring comes later.
 */
export default function AdminShippingPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Pengiriman</h1>
          <p className="mt-1 text-sm text-neutral-500">Pantau pengiriman dan status pemenuhan pesanan.</p>
        </div>
        <button
          type="button"
          className="h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
        >
          Atur kurir
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white px-4 py-4 ring-1 ring-neutral-900/10">
          <p className="text-sm text-neutral-500">Dalam perjalanan</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">42</p>
        </div>
        <div className="rounded-xl bg-white px-4 py-4 ring-1 ring-neutral-900/10">
          <p className="text-sm text-neutral-500">Terkirim bulan ini</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">388</p>
        </div>
        <div className="rounded-xl bg-white px-4 py-4 ring-1 ring-neutral-900/10">
          <p className="text-sm text-neutral-500">Rata-rata waktu kirim</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">2,4 hari</p>
        </div>
      </div>

      <Panel
        title="Pengiriman Aktif"
        subtitle={`${adminShipments.length} pengiriman`}
        bodyClassName="px-0 pb-0"
        action={<SearchBox placeholder="Cari resi…" className="w-48" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-neutral-100/40 text-left text-sm font-medium text-neutral-900">
                <th className="h-10 px-4 font-medium font-medium">Resi</th>
                <th className="h-10 px-4 font-medium font-medium">Pesanan</th>
                <th className="h-10 px-4 font-medium font-medium">Kurir</th>
                <th className="h-10 px-4 font-medium font-medium">Tujuan</th>
                <th className="h-10 px-4 font-medium text-right font-medium">Estimasi</th>
                <th className="h-10 px-4 font-medium text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {adminShipments.map((shipment) => (
                <tr key={shipment.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">{shipment.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">{shipment.order}</td>
                  <td className="px-4 py-3 text-neutral-700">{shipment.courier}</td>
                  <td className="px-4 py-3 text-neutral-700">{shipment.destination}</td>
                  <td className="px-4 py-3 text-right text-xs text-neutral-500">{shipment.eta}</td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill tone={TONE[shipment.status] ?? 'slate'}>{shipment.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
