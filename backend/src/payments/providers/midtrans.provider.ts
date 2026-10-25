import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash, timingSafeEqual } from 'node:crypto'
import {
  ChargeRequest,
  ChargeResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  WebhookEventType,
} from './payment-provider.interface'

interface SnapResponse {
  token?: string
  redirect_url?: string
  status_code?: string
  status_message?: string
}

interface MidtransNotification {
  order_id: string
  status_code: string
  gross_amount: string
  signature_key?: string
  transaction_status: string
  fraud_status?: string
  payment_type?: string
  transaction_time?: string
  status_message?: string
}

/**
 * Midtrans Snap provider (sandbox by default — free accounts work).
 *
 * Flow: createCharge() opens a Snap transaction via the REST API and hands the
 * customer the `redirect_url`. Midtrans later calls our webhook with an HTTP
 * notification; the `signature_key` it sends is
 * sha512(`${order_id}${status_code}${gross_amount}${serverKey}`), verified in
 * constant time against the raw body fields. `order_id` is our providerRef.
 *
 * No card/VA data flows through this codebase: the customer only ever sees the
 * Midtrans-hosted page, and we store the notification payload for audit.
 */
@Injectable()
export class MidtransProvider implements PaymentProvider {
  readonly name = 'midtrans'

  private get serverKey(): string {
    const key = process.env.MIDTRANS_SERVER_KEY
    if (!key) {
      throw new ServiceUnavailableException(
        'MIDTRANS_SERVER_KEY is not configured',
      )
    }
    return key
  }

  private get clientKey(): string | undefined {
    return process.env.MIDTRANS_CLIENT_KEY || undefined
  }

  /** Sandbox is the default so a free demo account works out of the box. */
  private get isProduction(): boolean {
    return process.env.MIDTRANS_IS_PRODUCTION === 'true'
  }

  /**
   * Where Snap sends the customer once the payment flow ends. Sent per
   * transaction so it cannot be lost to a stale dashboard setting (which is
   * how shoppers used to land on the documentation placeholder example.com).
   */
  private get frontendUrl(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  }

  private get apiBaseUrl(): string {
    return this.isProduction
      ? 'https://app.midtrans.com/snap/v1'
      : 'https://app.sandbox.midtrans.com/snap/v1'
  }

  private get ttlMinutes(): number {
    const configured = Number(process.env.PAYMENT_TTL_MINUTES)
    return Number.isFinite(configured) && configured > 0 ? configured : 30
  }

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000)

    // This string is our providerRef AND the Snap `order_id`: the notification
    // only ever carries `order_id` back, and the webhook resolves the payment
    // by providerRef — so both sides must be this one value. The Snap token is
    // only used to build the redirect URL.
    const providerRef = `ORD-${request.orderId}-${Date.now().toString(36)}`

    const payload = {
      transaction_details: {
        order_id: providerRef,
        gross_amount: Math.round(request.amount),
      },
      item_details: [
        {
          id: request.orderId,
          name: `Order ${request.orderId.slice(0, 12)}`.slice(0, 50),
          price: Math.round(request.amount),
          quantity: 1,
        },
      ],
      customer_details: {
        email: request.customer.email,
        first_name: request.customer.name || 'Customer',
      },
      callbacks: {
        finish: `${this.frontendUrl}/orders`,
        error: `${this.frontendUrl}/orders`,
        unfinish: `${this.frontendUrl}/orders`,
      },
      expiry: {
        unit: 'minute',
        duration: this.ttlMinutes,
      },
    }

    let response: Response
    try {
      response = await fetch(`${this.apiBaseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw new ServiceUnavailableException('Cannot reach the Midtrans API')
    }

    const body = (await response.json().catch(() => ({}))) as SnapResponse
    if (!response.ok || !body.redirect_url || !body.token) {
      throw new ServiceUnavailableException(
        `Midtrans rejected the transaction: ${body.status_message ?? response.status}`,
      )
    }

    return {
      providerRef,
      paymentUrl: body.redirect_url,
      expiresAt,
    }
  }

  /**
   * Midtrans signs notifications with sha512(order_id + status_code +
   * gross_amount + server_key) — not an HMAC over the raw body — so the raw
   * buffer must be parsed to recompute the digest. The comparison itself is
   * constant-time to keep timing information out of an attacker's hands.
   */
  verifySignature(rawBody: Buffer, signature?: string): boolean {
    let notification: MidtransNotification
    try {
      notification = JSON.parse(rawBody.toString('utf8'))
    } catch {
      return false
    }

    // Midtrans puts the digest INSIDE the body (`signature_key`); it never sends
    // a signature header. The argument path stays for our own signed test calls.
    const provided = signature ?? notification.signature_key
    if (!provided) return false

    if (!notification.order_id || !notification.status_code || !notification.gross_amount) {
      return false
    }

    const expected = createHash('sha512')
      .update(
        `${notification.order_id}${notification.status_code}` +
          `${notification.gross_amount}${this.serverKey}`,
      )
      .digest('hex')

    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }

  parseWebhook(rawBody: Buffer): NormalizedWebhookEvent {
    let notification: MidtransNotification
    try {
      notification = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new BadRequestException('Malformed webhook payload')
    }

    const { order_id: orderRef, transaction_status: status, fraud_status: fraud } = notification
    if (!orderRef || !status) {
      throw new BadRequestException('Unsupported webhook event')
    }

    let type: WebhookEventType
    if (status === 'settlement' || status === 'capture') {
      // Midtrans may hold a capture for manual review in the sandbox.
      type = fraud === 'challenge' ? 'payment.failed' : 'payment.captured'
    } else if (status === 'deny' || status === 'cancel') {
      type = 'payment.failed'
    } else if (status === 'expire') {
      type = 'payment.expired'
    } else {
      // pending / refund handled elsewhere: pending is not a terminal event we
      // can map, so reject the delivery instead of guessing.
      throw new BadRequestException(`Unsupported Midtrans transaction status: ${status}`)
    }

    return {
      // Midtrans does not send a separate event id; the order id + status pair
      // is unique per notification in practice, and the webhook_events table
      // dedupes replays anyway.
      eventId: `midtrans-${orderRef}-${type}`,
      type,
      providerRef: orderRef,
      amount: notification.gross_amount ? Number(notification.gross_amount) : undefined,
      method: notification.payment_type,
      occurredAt: notification.transaction_time
        ? new Date(notification.transaction_time)
        : new Date(),
      raw: notification,
    }
  }
}
