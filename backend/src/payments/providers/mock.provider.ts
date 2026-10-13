import { BadRequestException, Injectable } from '@nestjs/common'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  ChargeRequest,
  ChargeResult,
  NormalizedWebhookEvent,
  PaymentProvider,
  WebhookEventType,
} from './payment-provider.interface'

/**
 * Sandbox gateway used for local development and CI.
 *
 * It behaves like a real gateway: creates a reference + payment URL, and the
 * "gateway side" delivers signed webhook calls. Requests are signed with
 * HMAC-SHA256 over the raw body using PAYMENT_MOCK_SECRET, so the production
 * verification path (raw body + signature + idempotency) is exercised locally
 * too. No card data is ever collected or stored.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  private get secret(): string {
    const secret = process.env.PAYMENT_MOCK_SECRET
    if (!secret || secret.length < 16) {
      throw new BadRequestException(
        'PAYMENT_MOCK_SECRET is not configured (min 16 characters)',
      )
    }
    return secret
  }

  private get frontendUrl(): string {
    return process.env.FRONTEND_URL ?? 'http://localhost:3000'
  }

  private get ttlMinutes(): number {
    const configured = Number(process.env.PAYMENT_TTL_MINUTES)
    return Number.isFinite(configured) && configured > 0 ? configured : 30
  }

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const providerRef = `MOCK-${request.orderId}-${randomUUID().slice(0, 8)}`

    return {
      providerRef,
      paymentUrl: `${this.frontendUrl}/pay/${providerRef}`,
      expiresAt: new Date(Date.now() + this.ttlMinutes * 60_000),
    }
  }

  sign(rawBody: Buffer): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex')
  }

  verifySignature(rawBody: Buffer, signature?: string): boolean {
    if (!signature) return false

    const expected = Buffer.from(this.sign(rawBody), 'utf8')
    const received = Buffer.from(signature, 'utf8')
    if (expected.length !== received.length) return false

    return timingSafeEqual(expected, received)
  }

  parseWebhook(rawBody: Buffer): NormalizedWebhookEvent {
    let payload: Partial<{
      eventId: string
      type: WebhookEventType
      providerRef: string
      amount: number
      method: string
      occurredAt: string
    }>

    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch {
      throw new BadRequestException('Malformed webhook payload')
    }

    const types: WebhookEventType[] = ['payment.captured', 'payment.failed', 'payment.expired']
    if (!payload.providerRef || !payload.type || !types.includes(payload.type)) {
      throw new BadRequestException('Unsupported webhook event')
    }

    return {
      eventId: payload.eventId ?? `evt-${payload.providerRef}-${payload.type}`,
      type: payload.type,
      providerRef: payload.providerRef,
      amount: payload.amount,
      method: payload.method,
      occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
      raw: payload,
    }
  }

  /**
   * Simulator-only helper: builds the exact webhook body a gateway would send.
   * Used by the dev sandbox endpoints so the signed verification path is real.
   */
  buildSimulatedEvent(
    providerRef: string,
    type: WebhookEventType,
    amount: number,
  ): { body: Buffer; signature: string } {
    const body = Buffer.from(
      JSON.stringify({
        eventId: `evt-${randomUUID()}`,
        type,
        providerRef,
        amount,
        method: 'mock_va',
        occurredAt: new Date().toISOString(),
      }),
      'utf8',
    )

    return { body, signature: this.sign(body) }
  }
}
