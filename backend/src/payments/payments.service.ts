import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { InventoryService } from '../inventory/inventory.service'
import { NotificationsService } from '../notifications/notifications.service'
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  WebhookEventType,
} from './providers/payment-provider.interface'

/** Providers that can also *simulate* a gateway callback (dev/CI only). */
interface SimulatorCapable {
  buildSimulatedEvent: (
    providerRef: string,
    type: WebhookEventType,
    amount: number,
  ) => { body: Buffer; signature: string }
}

function hasSimulator(
  provider: PaymentProvider,
): provider is PaymentProvider & SimulatorCapable {
  return typeof (provider as Partial<SimulatorCapable>).buildSimulatedEvent === 'function'
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  get providerName(): string {
    return this.provider.name
  }

  /**
   * Creates a payment attempt for a PENDING order.
   *
   * The amount always comes from the stored order — never from the client — and
   * a new attempt supersedes nothing: previous failures stay in history.
   */
  async createPayment(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, status: true, totalPrice: true, userId: true, user: { select: { email: true, name: true } } },
    })
    if (!order) throw new NotFoundException('Order not found')

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        order.status === 'PAID'
          ? 'Order is already paid'
          : `Order cannot be paid in status ${order.status}`,
      )
    }

    if (order.totalPrice <= 0) {
      throw new BadRequestException('Order total is not payable')
    }

    await this.prisma.payment.updateMany({
      where: { orderId, status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', failureReason: 'Payment window elapsed' },
    })

    const charge = await this.provider.createCharge({
      orderId,
      amount: order.totalPrice,
      customer: {
        id: order.userId,
        email: order.user.email,
        name: order.user.name,
      },
    })

    return this.prisma.payment.create({
      data: {
        orderId,
        provider: this.provider.name,
        providerRef: charge.providerRef,
        amount: order.totalPrice,
        status: 'PENDING',
        paymentUrl: charge.paymentUrl,
        expiresAt: charge.expiresAt,
      },
    })
  }

  async listForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    })
    if (!order) throw new NotFoundException('Order not found')

    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Webhook entry point.
   *
   * Order of operations matters: verify the signature first, then remember the
   * event (so a retry is recognizable), then apply effects exactly once.
   * Payment status is only ever driven from here or from `simulate()`, never
   * from the client.
   */
  async handleWebhook(input: { rawBody: Buffer; signature?: string }) {
    const event = this.provider.parseWebhook(input.rawBody)
    const signatureValid = this.provider.verifySignature(input.rawBody, input.signature)

    if (!signatureValid) {
      // Audit rejected attempts, but never let the caller's event id claim the
      // unique slot: a replay of an unsigned body must still answer 401, not a
      // constraint conflict, and an attacker must not be able to squat ids.
      await this.recordRejectedEvent(event, 'Invalid signature')
      throw new UnauthorizedException('Invalid webhook signature')
    }

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: this.provider.name, eventId: event.eventId } },
    })
    if (existing?.processedAt) {
      return { received: true, duplicate: true, type: event.type }
    }

    const record =
      existing ??
      (await this.recordEvent(event).catch(async (error) => {
        // Concurrent delivery of the same event: treat the loser as a duplicate.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return this.prisma.webhookEvent.findUniqueOrThrow({
            where: {
              provider_eventId: { provider: this.provider.name, eventId: event.eventId },
            },
          })
        }
        throw error
      }))

    try {
      await this.applyEvent(event)
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date(), error: null },
      })
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { id: record.id },
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
      })
      throw error
    }

    return { received: true, duplicate: false, type: event.type }
  }

  private async recordEvent(event: { eventId: string; type: string; raw: unknown }) {
    return this.prisma.webhookEvent.create({
      data: {
        provider: this.provider.name,
        eventId: event.eventId,
        type: event.type,
        signatureValid: true,
        payload: event.raw as Prisma.InputJsonValue,
      },
    })
  }

  private async recordRejectedEvent(
    event: { eventId: string; type: string; raw: unknown },
    reason: string,
  ) {
    const stored = await this.prisma.webhookEvent.create({
      data: {
        provider: this.provider.name,
        eventId: `rejected-${randomUUID()}`,
        type: event.type,
        signatureValid: false,
        payload: event.raw as Prisma.InputJsonValue,
        error: `${reason} (claimed eventId: ${event.eventId})`,
      },
    })
    this.logger.warn(`Rejected webhook event ${event.eventId}: ${reason}`)
    return stored
  }

  /** Applies a verified event to payment + order + inventory, atomically. */
  private async applyEvent(event: {
    type: WebhookEventType
    providerRef: string
    amount?: number
    method?: string
    raw: unknown
  }) {
    return this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { providerRef: event.providerRef },
          include: { order: { select: { id: true, userId: true, status: true } } },
        })
        if (!payment) throw new NotFoundException('Unknown payment reference')

        if (event.type === 'payment.captured') {
          // Amount tampering check: the gateway must confirm what we charged.
          if (event.amount !== undefined && Math.abs(event.amount - payment.amount) > 0.01) {
            throw new BadRequestException('Webhook amount does not match the payment')
          }

          if (payment.status === 'PAID') {
            return { applied: false, reason: 'already-paid' as const }
          }
          if (['EXPIRED', 'REFUNDED'].includes(payment.status)) {
            throw new BadRequestException(`Payment is ${payment.status} and cannot be captured`)
          }

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'PAID',
              paidAt: new Date(),
              method: event.method ?? payment.method,
              rawPayload: event.raw as Prisma.InputJsonValue,
            },
          })

          const wasPending = payment.order.status === 'PENDING'
          if (wasPending) {
            await tx.order.update({
              where: { id: payment.order.id },
              data: { status: 'PAID', paidAt: new Date() },
            })

            // Holds become a real on-hand deduction.
            const movements = await this.inventory.consumeForOrder(tx, {
              orderId: payment.order.id,
              userId: payment.order.userId,
              reason: 'payment-captured',
            })

            await this.notifications.notify(
              {
                userId: payment.order.userId,
                type: 'ORDER_PAID',
                title: 'Pembayaran diterima',
                body: `Pesanan ${payment.order.id.slice(0, 8)} sudah dibayar dan sedang diproses.`,
                meta: { orderId: payment.order.id, paymentId: payment.id },
              },
              tx,
            )

            await this.inventory.alertIfLowStock(
              tx,
              movements.map((m) => m.productId),
            )
          }

          return { applied: true, orderStatus: wasPending ? 'PAID' : payment.order.status }
        }

        if (event.type === 'payment.failed') {
          if (payment.status === 'PAID') {
            return { applied: false, reason: 'already-paid' as const }
          }

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              failureReason: 'Rejected by the payment gateway',
              rawPayload: event.raw as Prisma.InputJsonValue,
            },
          })

          // The order stays PENDING so the customer can try another method;
          // holds remain active until their expiry.
          await this.notifications.notify(
            {
              userId: payment.order.userId,
              type: 'PAYMENT_FAILED',
              title: 'Pembayaran gagal',
              body: `Pembayaran untuk pesanan ${payment.order.id.slice(0, 8)} gagal. Silakan coba lagi.`,
              meta: { orderId: payment.order.id, paymentId: payment.id },
            },
            tx,
          )

          // Also worth an admin's attention: the order stays PENDING and its
          // holds keep counting down, so somebody may need to reach the buyer.
          await this.notifications.notifyAdmins(
            {
              type: 'PAYMENT_FAILED',
              title: `Pembayaran gagal untuk pesanan ${payment.order.id.slice(0, 8)}`,
              body: `Pembayaran ditolak gateway. Pesanan tetap menunggu pembayaran hingga hold-nya kedaluwarsa.`,
              meta: { orderId: payment.order.id, paymentId: payment.id },
            },
            tx,
          )

          return { applied: true, reason: 'payment-failed' as const }
        }

        // payment.expired
        if (payment.status === 'PAID') {
          return { applied: false, reason: 'already-paid' as const }
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'EXPIRED', rawPayload: event.raw as Prisma.InputJsonValue },
        })

        const released = await this.inventory.releaseForOrder(tx, payment.order.id)
        if (payment.order.status === 'PENDING') {
          await tx.order.update({
            where: { id: payment.order.id },
            data: { status: 'CANCELLED' },
          })
          await this.notifications.notify(
            {
              userId: payment.order.userId,
              type: 'ORDER_CANCELLED',
              title: 'Pesanan dibatalkan',
              body: `Waktu pembayaran pesanan ${payment.order.id.slice(0, 8)} habis. Stok sudah dilepas.`,
              meta: { orderId: payment.order.id },
            },
            tx,
          )
        }

        return { applied: true, releasedHolds: released }
      },
      { timeout: 15000 },
    )
  }

  /**
   * Sandbox helper: plays the role of the gateway calling our webhook, signed
   * with the same secret. Only available for the mock provider outside
   * production, so the real verification/idempotency path is what gets tested.
   */
  async simulate(
    providerRef: string,
    outcome: 'captured' | 'failed' | 'expired',
    userId: string,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException()
    }
    if (!hasSimulator(this.provider)) {
      throw new BadRequestException(
        `Provider ${this.provider.name} does not support simulation`,
      )
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerRef },
      select: {
        providerRef: true,
        amount: true,
        status: true,
        order: { select: { userId: true } },
      },
    })
    if (!payment) throw new NotFoundException('Unknown payment reference')
    // Even in the sandbox, only the buyer who owns the order may settle it.
    if (payment.order.userId !== userId) {
      throw new NotFoundException('Unknown payment reference')
    }

    const type: WebhookEventType =
      outcome === 'captured'
        ? 'payment.captured'
        : outcome === 'failed'
          ? 'payment.failed'
          : 'payment.expired'

    const simulated = this.provider.buildSimulatedEvent(
      payment.providerRef,
      type,
      payment.amount,
    )

    this.logger.log(`Simulating ${type} for ${providerRef}`)

    return this.handleWebhook({
      rawBody: simulated.body,
      signature: simulated.signature,
    })
  }

  /** Exposed for tests/ops: is the configured provider the sandbox one? */
  isSimulationEnabled(): boolean {
    return process.env.NODE_ENV !== 'production' && hasSimulator(this.provider)
  }

  /** Payment summary for an order (used by the order detail screen). */
  async summarize(orderId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, provider: true, paymentUrl: true, amount: true },
    })

    return {
      provider: this.providerName,
      latest: payments[0] ?? null,
      history: payments,
    }
  }
}
