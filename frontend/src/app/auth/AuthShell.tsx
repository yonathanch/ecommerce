'use client'

import { forwardRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleAlert, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared shell for /login and /signup, styled after the split-screen auth
 * mockup and filling the whole viewport: a slim bar carries the OUTFITX
 * wordmark above the split, the form lives on a white left half, and a soft
 * sky-blue ("biru muda") panel with the store's shopping illustration fills
 * the right, separated by a thin blue divider.
 */
export interface AuthShellProps {
  greeting: string
  title: string
  children: React.ReactNode
  footer: React.ReactNode
}

export function AuthShell({ greeting, title, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      {/* Top bar — the wordmark doubles as the way back to the storefront. */}
      <header className="flex h-16 shrink-0 items-center bg-white px-6 sm:px-10 lg:px-14">
        <Link
          href="/"
          aria-label="OUTFITX — kembali ke beranda"
          className="text-2xl font-bold tracking-tight text-blue-600 transition hover:text-blue-700"
        >
          OUTFITX
        </Link>
      </header>

      <div className="grid w-full flex-1 lg:grid-cols-[1.05fr_1fr]">
        {/* --------------------------------------------------- form side */}
        <div className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
          <div className="w-full max-w-sm">
            <p className="text-sm tracking-wide text-neutral-500">{greeting}</p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-neutral-900">
              {title}
            </h1>

            <div className="mt-8">{children}</div>

            <div className="mt-8 text-center text-sm text-neutral-500 lg:text-left">
              {footer}
            </div>
          </div>
        </div>

        {/* ------------------------------------------- illustration panel */}
        <aside className="relative block h-64 overflow-hidden border-t-[3px] border-sky-500 bg-sky-100 sm:h-80 lg:h-auto lg:border-l-[3px] lg:border-t-0">
          {/* Square artboard anchored to the panel bottom; the top band masks
              the stock illustration's baked-in title so only the scene shows. */}
          <div className="absolute inset-x-0 bottom-0 aspect-square overflow-hidden">
            <img
              src="/auth-illustration.jpg"
              alt="Ilustrasi belanja online OUTFITX"
              className="h-full w-full object-cover object-bottom mix-blend-multiply"
            />
            <div aria-hidden className="absolute inset-x-0 top-0 h-[22%] bg-sky-100" />
          </div>
        </aside>
      </div>
    </main>
  )
}

/** Base field styles shared by every auth input — soft sky-tinted fill. */
export const authInputClass = cn(
  'h-12 w-full rounded-lg border border-sky-200 bg-sky-50/70 px-4 text-sm text-neutral-900',
  'placeholder:text-neutral-400 transition outline-none',
  'focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-500/10',
)

const authErrorClass = 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10'

/** Server/axios error rendered as an alert above the fields. */
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
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-sky-100 hover:text-sky-600"
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

/** Full-width pill primary action with a spinner while submitting. */
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
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-sky-600 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <>
          <Loader className="size-4 animate-spin" />
          {busyLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="size-4" />
        </>
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
          className="font-semibold text-sky-600 transition hover:text-sky-700 hover:underline"
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
