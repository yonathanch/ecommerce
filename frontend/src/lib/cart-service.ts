'use client'

import { useEffect, useState } from 'react'
import apiClient from './api-client'

export interface CartProduct {
  id: string
  name: string
  price: number
  stock: number
  images: { url: string; alt: string | null }[]
}

/** The variant a cart line points at, when it names one. */
export interface CartVariant {
  sku: string
  options: Record<string, string>
  price: number | null
  stock: number
  imageUrl: string | null
}

export interface CartLine {
  id: string
  productId: string
  /** null when the line is the base product (no variants). */
  variantSku: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  stock: number
  variant: CartVariant | null
  product: CartProduct | null
}

export interface CartState {
  items: CartLine[]
  subtotal: number
  totalItems: number
  loading: boolean
  ready: boolean
  error: string | null
}

const EMPTY: CartState = {
  items: [],
  subtotal: 0,
  totalItems: 0,
  loading: false,
  ready: false,
  error: null,
}

let state: CartState = EMPTY
const listeners = new Set<() => void>()

function setState(patch: Partial<CartState>) {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

function errorMessage(error: any, fallback: string) {
  const message = error?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' ? message : fallback
}

function isSignedIn() {
  return typeof window !== 'undefined' && Boolean(window.localStorage.getItem('token'))
}

export const cartStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Drops local cart state (used on sign-out). */
  reset() {
    setState({ ...EMPTY, ready: true })
  },
}

/** Loads the server cart; a no-op for guests (server carts need a session). */
export async function refreshCart() {
  if (!isSignedIn()) {
    cartStore.reset()
    return
  }
  setState({ loading: true })
  try {
    const res = await apiClient.get('/cart')
    setState({
      items: res.data.cart ?? [],
      subtotal: res.data.subtotal ?? 0,
      totalItems: res.data.totalItems ?? 0,
      error: null,
    })
  } catch (error: any) {
    if (error?.response?.status === 401) {
      cartStore.reset()
      return
    }
    setState({ error: errorMessage(error, 'Could not load your cart') })
  } finally {
    setState({ loading: false, ready: true })
  }
}

export async function addToCart(productId: string, quantity = 1, variantSku?: string) {
  setState({ error: null })
  try {
    await apiClient.post('/cart/items', {
      productId,
      quantity,
      ...(variantSku ? { variantSku } : {}),
    })
    await refreshCart()
    return { ok: true as const }
  } catch (error: any) {
    const message = errorMessage(error, 'Could not add to cart')
    setState({ error: message })
    return { ok: false as const, error: message }
  }
}

export async function updateQuantity(
  productId: string,
  quantity: number,
  variantSku?: string,
) {
  setState({ error: null })
  try {
    await apiClient.put(`/cart/items/${productId}`, {
      quantity,
      ...(variantSku ? { variantSku } : {}),
    })
    await refreshCart()
    return { ok: true as const }
  } catch (error: any) {
    const message = errorMessage(error, 'Could not update the cart')
    setState({ error: message })
    return { ok: false as const, error: message }
  }
}

export async function removeItem(productId: string, variantSku?: string) {
  setState({ error: null })
  try {
    await apiClient.delete(`/cart/items/${productId}`, {
      params: variantSku ? { variantSku } : {},
    })
    await refreshCart()
    return { ok: true as const }
  } catch (error: any) {
    const message = errorMessage(error, 'Could not remove the item')
    setState({ error: message })
    return { ok: false as const, error: message }
  }
}

export async function clearCart() {
  setState({ error: null })
  try {
    await apiClient.post('/cart/clear')
  } finally {
    await refreshCart()
  }
}

/** Clears local cart state after sign-out. */
export function resetCart() {
  cartStore.reset()
}

/** Drops a stale cart error (used when its banner is dismissed). */
export function clearCartError() {
  setState({ error: null })
}

export function useCart() {
  const [snapshot, setSnapshot] = useState<CartState>(() => cartStore.get())

  useEffect(() => {
    const unsubscribe = cartStore.subscribe(() => setSnapshot(cartStore.get()))
    if (!cartStore.get().ready) void refreshCart()
    return unsubscribe
  }, [])

  return {
    ...snapshot,
    refresh: refreshCart,
    addToCart,
    addItem: addToCart,
    updateQuantity,
    removeItem,
    clearCart,
    clearError: clearCartError,
  }
}
