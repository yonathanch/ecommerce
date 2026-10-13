/**
 * Gateway-agnostic contract. Everything above this interface (service,
 * controllers, webhook handling, order state machine) is provider independent;
 * a new gateway is added by implementing `PaymentProvider` only.
 */
export interface ChargeRequest {
  orderId: string
  amount: number
  customer: { id: string; email: string; name: string }
}

export interface ChargeResult {
  /** Gateway-side identifier; unique per attempt and stored on Payment. */
  providerRef: string
  /** Where the customer completes the payment. */
  paymentUrl: string
  expiresAt: Date
}

/** Webhook event types every provider must normalize to. */
export type WebhookEventType = 'payment.captured' | 'payment.failed' | 'payment.expired'

export interface NormalizedWebhookEvent {
  eventId: string
  type: WebhookEventType
  providerRef: string
  amount?: number
  method?: string
  occurredAt: Date
  /** Raw parsed payload, stored for audit/debugging. */
  raw: unknown
}

export interface PaymentProvider {
  readonly name: string
  createCharge(request: ChargeRequest): Promise<ChargeResult>
  /** Constant-time signature verification over the *raw* request body. */
  verifySignature(rawBody: Buffer, signature?: string): boolean
  parseWebhook(rawBody: Buffer): NormalizedWebhookEvent
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')
