import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { InventoryService, ReservationItem } from '../inventory/inventory.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CouponService } from '../coupon/coupon.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { CheckoutDto } from './dto/checkout.dto'

export type { CreateOrderDto }

const round2 = (n: number) => Math.round(n * 100) / 100

type Tx = Prisma.TransactionClient

const ORDER_LIST_INCLUDE = {
  items: true,
  payments: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { id: true, status: true, provider: true, paymentUrl: true, amount: true },
  },
} satisfies Prisma.OrderInclude

/**
 * Owns the order lifecycle: creation, stock holds, cancellation and expiry.
 *
 * Stock mechanics live in InventoryService, coupon accounting in CouponService
 * and user-facing messaging in NotificationsService; this service only
 * orchestrates them inside a single transaction per use case.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly couponService: CouponService,
  ) {}

  /**
   * Checkout: turns the user's server-side cart into a PENDING order and holds
   * the stock. On-hand stock is only reduced when the payment is captured
   * (see PaymentsService), and the hold is what keeps other buyers from taking
   * those units in the meantime.
   */
  async checkout(userId: string, dto: CheckoutDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, stock: true } },
          },
        },
      },
    })

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty')
    }

    const missing = cart.items.find((item) => !item.product)
    if (missing) throw new BadRequestException('Cart contains an unavailable product')

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    })
    if (!address) throw new NotFoundException('Address not found')

    const subtotal = round2(
      cart.items.reduce((sum, item) => sum + item.product!.price * item.quantity, 0),
    )

    // Resolved before mutating anything so the user gets a clear error instead
    // of a rolled-back transaction.
    const coupon = dto.couponCode
      ? await this.couponService.resolveCoupon(dto.couponCode, subtotal, { userId })
      : null

    const discount = coupon ? coupon.discount : 0
    const totalPrice = round2(subtotal - discount)

    const order = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.order.create({
          data: {
            userId,
            subtotal,
            discount,
            totalPrice,
            couponCode: coupon?.coupon.code ?? null,
            addressId: address.id,
            shippingAddress: {
              recipient: address.recipient,
              phone: address.phone,
              line1: address.line1,
              line2: address.line2,
              city: address.city,
              province: address.province,
              postalCode: address.postalCode,
              country: address.country,
            },
            status: 'PENDING',
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                productName: item.product!.name,
                price: item.product!.price,
                quantity: item.quantity,
              })),
            },
          },
          include: { items: true },
        })

        const { expiresAt } = await this.inventory.reserveForOrder(tx, {
          orderId: created.id,
          userId,
          items: cart.items.map<ReservationItem>((item) => ({
            productId: item.productId,
            productName: item.product!.name,
            quantity: item.quantity,
          })),
        })

        if (coupon) {
          await this.couponService.consume(coupon.couponId, userId, created.id, tx)
        }

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } })

        return tx.order.update({
          where: { id: created.id },
          data: { expiresAt },
          include: { items: true },
        })
      },
      { timeout: 15000 },
    )

    await this.notifications.notify({
      userId,
      type: 'ORDER_CREATED',
      title: 'Pesanan dibuat',
      body: `Pesanan ${order.id.slice(0, 8)} menunggu pembayaran sampai ${order.expiresAt?.toISOString() ?? '-'}.`,
      meta: { orderId: order.id, totalPrice: order.totalPrice },
    })

    return order
  }

  /**
   * Direct order creation from an explicit item list (no cart). Still holds
   * stock through the same path, so both entry points behave identically.
   */
  async create(userId: string, dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item')
    }

    for (const item of dto.items) {
      if (!item.productId) throw new BadRequestException('productId is required')
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new BadRequestException(`Invalid quantity for product ${item.productId}`)
      }
    }

    const productIds = [...new Set(dto.items.map((i) => i.productId))]
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true },
    })
    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products not found')
    }

    const subtotal = round2(
      dto.items.reduce((sum, item) => {
        const product = products.find((p) => p.id === item.productId)!
        return sum + product.price * item.quantity
      }, 0),
    )

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          subtotal,
          discount: 0,
          totalPrice: subtotal,
          status: 'PENDING',
          items: {
            create: dto.items.map((item) => {
              const product = products.find((p) => p.id === item.productId)!
              return {
                productId: product.id,
                productName: product.name,
                price: product.price,
                quantity: item.quantity,
                variantSku: item.variantSku ?? null,
              }
            }),
          },
        },
      })

      const { expiresAt } = await this.inventory.reserveForOrder(tx, {
        orderId: order.id,
        userId,
        items: dto.items.map<ReservationItem>((item) => ({
          productId: item.productId,
          productName: products.find((p) => p.id === item.productId)!.name,
          quantity: item.quantity,
        })),
      })

      return tx.order.update({
        where: { id: order.id },
        data: { expiresAt },
        include: { items: true },
      })
    })
  }

  async findAll(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: ORDER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
        reservations: {
          select: { productId: true, quantity: true, status: true, expiresAt: true },
        },
      },
    })
    if (!order) throw new NotFoundException('Order not found')
    return order
  }

  /**
   * Cancels an unpaid order and releases everything it held (stock + coupon).
   * Paid orders are out of scope here: they need a refund, which is an admin
   * money flow (M8) and must not be reachable from the customer app.
   */
  async cancel(userId: string, id: string) {
    const order = await this.findOne(userId, id)

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Order is already cancelled')
    }
    if (order.status === 'PAID' || order.status === 'REFUNDED') {
      throw new BadRequestException(
        'Paid orders cannot be cancelled directly — a refund is required',
      )
    }
    if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
      throw new BadRequestException('Cannot cancel shipped or delivered orders')
    }

    return this.prisma.$transaction(async (tx) => {
      await this.inventory.releaseForOrder(tx, order.id)
      await this.couponService.refundForOrder(order.id, tx)

      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
        include: { items: true },
      })

      await this.notifications.notify(
        {
          userId,
          type: 'ORDER_CANCELLED',
          title: 'Pesanan dibatalkan',
          body: `Pesanan ${order.id.slice(0, 8)} dibatalkan. Stok yang ditahan sudah dilepas.`,
          meta: { orderId: order.id },
        },
        tx,
      )

      return cancelled
    })
  }

  /**
   * Sweeps PENDING orders whose payment window has passed: releases the holds,
   * refunds the coupon and cancels the order. Wired to an admin endpoint now;
   * M9 schedules it as a repeatable BullMQ job.
   */
  async expireStaleOrders() {
    const stale = await this.prisma.order.findMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      select: { id: true, userId: true },
      take: 200,
    })

    if (stale.length === 0) return { cancelled: 0, released: 0 }

    let released = 0
    for (const candidate of stale) {
      await this.prisma.$transaction(async (tx) => {
        // Re-read inside the transaction: it may have been paid meanwhile.
        const order = await tx.order.findUnique({
          where: { id: candidate.id },
          select: { id: true, userId: true, status: true },
        })
        if (!order || order.status !== 'PENDING') return

        released += await this.inventory.releaseForOrder(tx, order.id)
        await this.couponService.refundForOrder(order.id, tx)
        await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })

        await this.notifications.notify(
          {
            userId: order.userId,
            type: 'ORDER_CANCELLED',
            title: 'Pesanan dibatalkan otomatis',
            body: `Batas waktu pembayaran pesanan ${order.id.slice(0, 8)} habis. Stok sudah dilepas.`,
            meta: { orderId: order.id },
          },
          tx,
        )
      })
    }

    return { cancelled: stale.length, released }
  }

  /** Stock ledger scoped to this user's own orders. */
  async inventoryHistory(userId: string, productId?: string) {
    return this.prisma.inventoryTransaction.findMany({
      where: { userId, ...(productId ? { productId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }
}
