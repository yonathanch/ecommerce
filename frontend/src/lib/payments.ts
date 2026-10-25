'use client'

import apiClient from './api-client'

export interface StartedPayment {
  providerRef: string
  paymentUrl: string
  amount: number
  status: string
  provider?: string
  expiresAt?: string
}

/**
 * Asks the backend to open a payment attempt for an order and returns the
 * gateway URL to send the customer to.
 *
 * The client never decides the amount or marks anything as paid: the backend
 * reads the stored order total, and only a signature-verified webhook can move
 * a payment to PAID.
 */
export async function startPayment(orderId: string): Promise<StartedPayment> {
  const res = await apiClient.post('/payments', { orderId })
  return res.data
}

/**
 * Where to send the customer to pay.
 *
 * Only the local mock gateway needs the amount/order in the query string (it
 * renders them); a real gateway's URL is used exactly as issued, since unknown
 * query parameters on a hosted payment page are not ours to add.
 */
export function paymentRedirectUrl(payment: StartedPayment, orderId: string): string {
  if (payment.provider === 'mock') {
    return `${payment.paymentUrl}?amount=${payment.amount}&order=${orderId}`
  }
  return payment.paymentUrl
}

export function paymentErrorMessage(error: unknown): string {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response
    ?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' ? message : 'Tidak bisa memulai pembayaran'
}
