'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from 'cn'

/**
 * Overlay building blocks for the admin screens.
 *
 * The kit is hand-rolled (no headless-UI runtime), so these two primitives
 * carry the accessibility plumbing once — Escape-to-close, backdrop click,
 * body scroll-lock, and focus-on-open — instead of each screen re-implementing
 * it. They are presentational and fully controlled: the parent owns `open`
 * state and decides what closing means (including guarding unsaved edits).
 *
 * Pattern guidance (see the Detail feature):
 *   • Sheet  → inspect a record's detail without leaving the list.
 *   • Dialog → a short, focused form (few fields) such as editing a resi.
 */
export interface OverlayProps {
  open: boolean
  onClose: () => void
  /** Hide the built-in close button while a save is in flight. */
  busy?: boolean
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/** Escape + scroll-lock shared by both overlays. Focus lands on the panel. */
function useOverlayBehaviour(open: boolean, onClose: () => void, busy?: boolean) {
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    // Prevent the page behind from scrolling while the overlay is open.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the panel for keyboard/screen-reader users.
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose, busy])

  return panelRef
}

function CloseButton({ onClose, busy }: { onClose: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={busy}
      aria-label="Tutup"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40"
    >
      <X className="h-4 w-4" />
    </button>
  )
}

function OverlayHeader({
  title,
  subtitle,
  onClose,
  busy,
  hideClose,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose: () => void
  busy?: boolean
  hideClose?: boolean
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">{title}</h2>
        {subtitle && <div className="text-sm text-neutral-500">{subtitle}</div>}
      </div>
      {!hideClose && <CloseButton onClose={onClose} busy={busy} />}
    </header>
  )
}

/**
 * Right-side drawer. On mobile it takes the full width; from `sm` up it caps at
 * `maxWidth` so the list behind stays readable.
 */
export function Sheet({
  open,
  onClose,
  busy,
  title,
  subtitle,
  children,
  footer,
  className,
  maxWidth = 'sm:max-w-xl',
}: OverlayProps & { maxWidth?: string }) {
  const panelRef = useOverlayBehaviour(open, onClose, busy)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div
        className="absolute inset-0 animate-overlay-fade bg-neutral-900/40"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'animate-sheet-in-right absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl outline-none',
          maxWidth,
          className,
        )}
      >
        <OverlayHeader title={title} subtitle={subtitle} onClose={onClose} busy={busy} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/**
 * Centered modal for short forms. On mobile it insets a little from the edges
 * and can scroll; on larger screens it simply centers at `maxWidth`.
 */
export function Dialog({
  open,
  onClose,
  busy,
  title,
  subtitle,
  children,
  footer,
  className,
  maxWidth = 'sm:max-w-md',
}: OverlayProps & { maxWidth?: string }) {
  const panelRef = useOverlayBehaviour(open, onClose, busy)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div
        className="absolute inset-0 animate-overlay-fade bg-neutral-900/40"
        onClick={() => !busy && onClose()}
      />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4">
        <div
          ref={panelRef}
          tabIndex={-1}
          className={cn(
            'animate-dialog-in relative flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl',
            maxWidth,
            className,
          )}
        >
          <OverlayHeader title={title} subtitle={subtitle} onClose={onClose} busy={busy} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  )
}
