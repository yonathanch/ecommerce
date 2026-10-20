'use client'

import { forwardRef, useState } from 'react'
import Link from 'next/link'
import {
  CircleAlert,
  Eye,
  EyeOff,
  Heart,
  Lock,
  PackageSearch,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared shell for /login and /signup: a branded panel on the left (the store's
 * `mega-gradient`, same blue as the header wordmark) and the form on the right,
 * presented as one card on a soft backdrop — the layout big-fashion stores use
 * so the page still feels like the shop, not a generic auth widget.
 */
export interface AuthShellProps {
  title: string
  subtitle: string
  panelEyebrow: string
  panelHeadline: string
  panelCopy: string
  children: React.ReactNode
  footer: React.ReactNode
}

/** Real store capabilities only — no invented policies or fake stats. */
const BENEFITS = [
  { icon: Truck, text: 'Pengiriman ke seluruh Indonesia' },
  { icon: ShieldCheck, text: 'Pembayaran aman & terenkripsi' },
  { icon: Heart, text: 'Simpan produk favorit di wishlist' },
  { icon: PackageSearch, text: 'Lacak pesanan sampai depan pintu' },
] as const

export function AuthShell({
  title,
  subtitle,
  panelEyebrow,
  panelHeadline,
  panelCopy,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="flex min-h-[74vh] items-center justify-center bg-gradient-to-b from-blue-50/70 via-white to-neutral-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="animate-fade-in-up grid w-full max-w-5xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl shadow-neutral-900/5 lg:grid-cols-[1.05fr_1fr]">
        {/* ------------------------------------------------ brand panel */}
        <aside className="mega-gradient relative overflow-hidden p-7 text-white sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-white/5"
          />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100">
              {panelEyebrow}
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {panelHeadline}
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-blue-50/90">{panelCopy}</p>

            <ul className="mt-8 space-y-3.5">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm font-medium text-white/95">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>

            <p className="mt-9 flex items-center gap-2 border-t border-white/15 pt-5 text-xs text-blue-100">
              <Lock className="size-3.5 shrink-0" />
              Data akunmu tersimpan aman dan tidak pernah dibagikan.
            </p>
          </div>
        </aside>

        {/* -------------------------------------------------- form panel */}
        <div className="p-6 sm:p-10">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-7 border-t border-neutral-100 pt-5 text-center text-sm text-neutral-500">
            {footer}
          </div>
        </div>
      </div>
    </main>
  )
}

/** Base field styles shared by every auth input. */
export const authInputClass = cn(
  'h-11 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-3 text-sm text-neutral-900',
  'placeholder:text-neutral-400 transition outline-none',
  'focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10',
)

const authErrorClass = 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10'

/** Left-side field icon (mail, user, …) used by the plain text inputs. */
export function AuthInputIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
  )
}

/** Server/axios error rendered as a dismissible-looking alert above the fields. */
export function AuthError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-relaxed text-rose-700"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

/**
 * Password field with an accessible show/hide toggle.
 *
 * forwardRef is load-bearing: react-hook-register registers the field through
 * `ref`, and a plain function component never sees it — without this the form
 * would read the password as `undefined` on submit.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ hasError, className, ...props }, ref) {
    const [visible, setVisible] = useState(false)
    return (
    <div className="relative">
      <AuthInputIcon icon={Lock} />
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(authInputClass, 'pr-11', hasError && authErrorClass, className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
    )
  },
)

/** Small red inline message under a field. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1.5 text-xs font-medium text-rose-600">{message}</p>
}

/**
 * Turns backend auth errors into copy a shopper can act on. The API answers in
 * English while the storefront speaks Indonesian, so the few messages these two
 * forms can actually receive are mapped here; anything else (network failures,
 * unexpected states) falls back to the caller's generic Indonesian sentence.
 */
export function humanizeAuthError(e: any, fallback: string): string {
  if (e?.response?.status === 429) {
    return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.'
  }
  const raw = e?.response?.data?.message
  const message = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : ''
  if (message === 'Invalid credentials') return 'Email atau password salah.'
  if (message === 'Email already registered') {
    return 'Email ini sudah terdaftar. Silakan masuk ke akunmu.'
  }
  return message || fallback
}

/** Full-width primary action with a spinner while submitting. */
export function AuthSubmitButton({
  busy,
  busyLabel,
  children,
}: {
  busy: boolean
  busyLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <>
          <Loader className="size-4 animate-spin" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  )
}

function Loader({ className }: { className?: string }) {
  // Inline spinner avoids pulling in an icon alias that differs per lucide version.
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Switch link row shared by both pages (masuk ↔ daftar + kembali). */
export function AuthSwitch({ prompt, href, action }: { prompt: string; href: string; action: string }) {
  return (
    <>
      <p>
        {prompt}{' '}
        <Link
          href={href}
          className="font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
        >
          {action}
        </Link>
      </p>
      <p className="mt-2 text-xs text-neutral-400">
        <Link href="/" className="transition hover:text-neutral-600 hover:underline">
          ← Kembali ke beranda
        </Link>
      </p>
    </>
  )
}
