'use client'

import { ArrowDownRight, ArrowUpRight, Search } from 'lucide-react'

/**
 * Small UI kit for the admin screens ported from OrbynAdmin.
 *
 * Presentation only: no data fetching or business logic lives here, so the
 * layout can be swapped onto real endpoints later without touching these
 * building blocks.
 */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  // Matches the template's Card: rounded-xl, 16px rhythm (--card-spacing), and
  // a hairline ring instead of a border so the edge reads softer.
  return (
    <section
      className={`flex flex-col gap-4 overflow-hidden rounded-xl bg-white py-4 text-sm ring-1 ring-neutral-900/10 ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4">
        <div className="grid gap-1">
          <h2 className="text-base leading-snug font-medium text-neutral-900">{title}</h2>
          {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={bodyClassName ?? 'px-4'}>{children}</div>
    </section>
  )
}

export function StatCard({ label, value, delta, caption }: { label: string; value: string; delta?: number; caption?: string }) {
  const positive = (delta ?? 0) >= 0
  // Template's SummaryTile: muted label on top, one big tabular figure below.
  return (
    <div className="rounded-xl bg-white py-4 text-sm ring-1 ring-neutral-900/10">
      <div className="space-y-2 px-4">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        {/* Template's StatCard pushes the trend pill to the far right edge. */}
        <div className="flex items-end justify-between gap-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums text-neutral-900">
            {value}
          </span>
          {typeof delta === 'number' && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                positive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
              }`}
            >
              {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        {caption && <p className="text-xs text-neutral-500">{caption}</p>}
      </div>
    </div>
  )
}

export function SearchBox({ placeholder = 'Cari…', className = '' }: { placeholder?: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        type="search"
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
      />
    </div>
  )
}

export function StatusPill({ tone, children }: { tone: 'green' | 'amber' | 'blue' | 'rose' | 'slate'; children: React.ReactNode }) {
  // Template Badge: colour at 10% alpha over white, which reads far softer
  // than a solid tint fill.
  const tones: Record<string, string> = {
    green: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    blue: 'bg-blue-500/10 text-blue-600',
    rose: 'bg-rose-500/10 text-rose-600',
    slate: 'bg-neutral-500/10 text-neutral-600',
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

/**
 * Lightweight SVG area chart (two series, gradient fill). Hand-rolled on
 * purpose: the project does not depend on a chart library, and the template
 * only needs this one look.
 */
export function AreaChart({
  labels,
  series,
  height = 260,
}: {
  labels: string[]
  series: { name: string; color: string; values: number[] }[]
  height?: number
}) {
  const width = 640
  const padding = { top: 16, right: 12, bottom: 28, left: 52 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const max = Math.max(...series.flatMap((s) => s.values)) * 1.1

  const x = (i: number) => padding.left + (i * innerW) / Math.max(labels.length - 1, 1)
  const y = (value: number) => padding.top + innerH - (value / max) * innerH

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t)
  const formatTick = (value: number) =>
    value >= 1_000_000 ? `${Math.round(value / 1_000_000)}jt` : value >= 1000 ? `${Math.round(value / 1000)}rb` : String(Math.round(value))

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Grafik pendapatan dan laba">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`area-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
            <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-neutral-400 text-[10px]">
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {series.map((s, i) => {
          const line = s.values.map((v, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(v)}`).join(' ')
          const area = `${line} L${x(s.values.length - 1)},${padding.top + innerH} L${x(0)},${padding.top + innerH} Z`
          return (
            <g key={s.name}>
              <path d={area} fill={`url(#area-${i})`} />
              <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}

        {labels.map((label, index) => (
          <text key={label} x={x(index)} y={height - 8} textAnchor="middle" className="fill-neutral-400 text-[10px]">
            {label}
          </text>
        ))}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Horizontal bar list used by the "Sales by Category" panel. */
export function BarList({ items }: { items: { name: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm text-neutral-600">{item.name}</span>
          <span className="h-5 flex-1 overflow-hidden rounded bg-neutral-50">
            <span
              className="block h-full rounded bg-blue-600"
              style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
