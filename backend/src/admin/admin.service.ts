import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { slugify } from '../common/slug'
import { PrismaService } from '../prisma/prisma.service'
import { CouponType, UpdateCouponDto, CreateCouponDto } from './dto/admin.dto'
import { InventoryService } from '../inventory/inventory.service'
import {
  NotificationType,
  NotificationsService,
} from '../notifications/notifications.service'
import { CouponService } from '../coupon/coupon.service'

const round2 = (n: number) => Math.round(n * 100) / 100

/** Chart axis labels, in the shop's own language. */
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/** Orders whose money was actually collected (REFUNDED excluded on purpose). */
const COLLECTED: OrderStatus[] = ['PAID', 'SHIPPED', 'DELIVERED']

/** What an admin sees instead of guessing from three separate columns. */
type CouponStatus = 'AKTIF' | 'NONAKTIF' | 'KEDALUWARSA' | 'HABIS'

/** Codes are matched case-insensitively at checkout, so they are stored uppercase. */
const normalizeCouponCode = (code: string) => code.toUpperCase().trim()

/** A percentage above 100 would discount more than the cart is worth. */
function assertCouponValue(type: string, value: number) {
  if (type === 'PERCENT' && value > 100) {
    throw new BadRequestException('A percentage discount cannot exceed 100')
  }
}

/**
 * City from the checkout-time address snapshot. The snapshot is JSON, so the
 * shape is only as trustworthy as what checkout wrote — anything else is treated
 * as "unknown" rather than crashing the list.
 */
function destinationOf(snapshot: Prisma.JsonValue | null): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const city = (snapshot as Record<string, unknown>).city
  return typeof city === 'string' ? city : null
}

/** `null` means "never expires"; anything unparseable is a client error. */
function parseExpiry(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new BadRequestException('expiresAt is not a valid date')
  return date
}

/**
 * Fulfilment state machine. Everything not listed here is rejected, so a
 * mistyped request can never resurrect a cancelled order or ship a pending one.
 */
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CANCELLED'],
  PAID: ['SHIPPED', 'REFUNDED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
}

const STATUS_NOTIFICATIONS: Partial<
  Record<OrderStatus, { type: NotificationType; title: string; body: (ref: string) => string }>
> = {
  CANCELLED: {
    type: 'ORDER_CANCELLED',
    title: 'Pesanan dibatalkan oleh admin',
    body: (ref) => `Pesanan ${ref} dibatalkan. Stok yang ditahan sudah dilepas.`,
  },
  SHIPPED: {
    type: 'ORDER_SHIPPED',
    title: 'Pesanan dikirim',
    body: (ref) => `Pesanan ${ref} sedang dalam pengiriman.`,
  },
  DELIVERED: {
    type: 'ORDER_DELIVERED',
    title: 'Pesanan diterima',
    body: (ref) => `Pesanan ${ref} sudah diterima. Terima kasih sudah berbelanja!`,
  },
  REFUNDED: {
    type: 'ORDER_REFUNDED',
    title: 'Pesanan direfund',
    body: (ref) => `Dana pesanan ${ref} dikembalikan dan stoknya sudah masuk kembali ke gudang.`,
  },
}

/**
 * Back-office read/write surface for M8.
 *
 * Nothing here moves stock directly: it delegates to InventoryService (which
 * owns the ledger) and CouponService, so the admin app cannot invent a second
 * way of changing inventory.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationsService,
    private readonly couponService: CouponService,
  ) {}

  // --------------------------------------------------------------- dashboard

  /** Single call the dashboard header needs: money, orders, stock health. */
  async stats() {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      byStatus,
      collected,
      collectedToday,
      refunded,
      productRows,
      customers,
      activeHolds,
      expiredPending,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: COLLECTED } },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: COLLECTED }, paidAt: { gte: startOfToday } },
        _sum: { totalPrice: true },
      }),
      this.prisma.order.aggregate({
        where: { status: 'REFUNDED' },
        _count: { _all: true },
        _sum: { totalPrice: true },
      }),
      this.prisma.product.findMany({ select: { price: true, stock: true } }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.stockReservation.aggregate({
        where: { status: 'ACTIVE', expiresAt: { gt: now } },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.order.count({ where: { status: 'PENDING', expiresAt: { lt: now } } }),
      this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          totalPrice: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ])

    const statusCounts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]))
    const lowStock = await this.inventory.lowStock()
    const totalOrders = byStatus.reduce((sum, row) => sum + row._count._all, 0)

    return {
      orders: {
        total: totalOrders,
        byStatus: statusCounts,
      },
      revenue: {
        collected: round2(collected._sum.totalPrice ?? 0),
        collectedOrders: collected._count._all,
        today: round2(collectedToday._sum.totalPrice ?? 0),
        refunded: round2(refunded._sum.totalPrice ?? 0),
        refundedOrders: refunded._count._all,
      },
      products: {
        total: productRows.length,
        outOfStock: productRows.filter((row) => row.stock <= 0).length,
        lowStock: lowStock.length,
        inventoryValue: round2(productRows.reduce((sum, row) => sum + row.price * row.stock, 0)),
      },
      customers: { total: customers },
      holds: {
        active: activeHolds._count._all,
        units: activeHolds._sum.quantity ?? 0,
        expiredPendingOrders: expiredPending,
      },
      lowStock: lowStock.slice(0, 5),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        status: order.status,
        totalPrice: order.totalPrice,
        createdAt: order.createdAt,
        customer: order.user.email,
        itemCount: order._count.items,
      })),
    }
  }

  // ------------------------------------------------------------------ orders

  async listOrders({ status, search, page = 1, limit = 20 }: {
    status?: OrderStatus
    search?: string
    page?: number
    limit?: number
  }) {
    const take = Math.min(limit, 100)
    const where: Prisma.OrderWhereInput = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          items: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, provider: true, amount: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.order.count({ where }),
    ])

    return {
      items,
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    }
  }

  async getOrder(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        items: true,
        payments: { orderBy: { createdAt: 'desc' } },
        reservations: {
          select: { productId: true, quantity: true, status: true, expiresAt: true },
        },
        inventoryTransactions: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    return { ...order, allowedTransitions: ORDER_TRANSITIONS[order.status] }
  }

  /**
   * Fulfilment transition. Cancelling releases the holds; refunding pushes the
   * captured units back on the shelf and flips the payment to REFUNDED.
   */
  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    adminId: string,
    options: { reason?: string; courier?: string; trackingNumber?: string } = {},
  ) {
    const { reason } = options

    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    if (order.status === status) throw new BadRequestException(`Order is already ${status}`)

    const allowed = ORDER_TRANSITIONS[order.status]
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot change order status from ${order.status} to ${status}` +
          (allowed.length ? `. Allowed: ${allowed.join(', ')}` : ` (${order.status} is final)`),
      )
    }

    const updated = await this.prisma.$transaction(
      async (tx) => {
        if (status === 'CANCELLED') {
          await this.inventory.releaseForOrder(tx, order.id)
          await this.couponService.refundForOrder(order.id, tx)
        }
        if (status === 'REFUNDED') {
          await this.inventory.restockForOrder(tx, {
            orderId: order.id,
            userId: adminId,
            reason: reason ?? 'admin-refund',
          })
          await tx.payment.updateMany({
            where: { orderId: order.id, status: 'PAID' },
            data: { status: 'REFUNDED' },
          })
        }

        return tx.order.update({
          where: { id: order.id },
          data: {
            status,
            // Shipping stamps the moment the parcel left, and records the resi
            // when the admin already has it. A resi typed here is what the
            // customer reads on /orders.
            ...(status === 'SHIPPED'
              ? {
                  shippedAt: new Date(),
                  ...(options.courier ? { courier: options.courier } : {}),
                  ...(options.trackingNumber ? { trackingNumber: options.trackingNumber } : {}),
                }
              : {}),
          },
          include: { items: true, payments: { orderBy: { createdAt: 'desc' } } },
        })
      },
      { timeout: 15000 },
    )

    const template = STATUS_NOTIFICATIONS[status]
    if (template) {
      // The tracking number belongs in the shipping notification: it is the one
      // thing the customer needs to act on. Fixed on the resi, optional in the
      // storefront because the shipment may still be with the courier.
      const shipment =
        status === 'SHIPPED'
          ? [options.courier, options.trackingNumber].filter(Boolean).join(' · ')
          : ''

      await this.notifications.notify({
        userId: order.userId,
        type: template.type,
        title: template.title,
        body: shipment
          ? `${template.body(order.id.slice(0, 8))} (${shipment})`
          : template.body(order.id.slice(0, 8)),
        meta: {
          orderId: order.id,
          status,
          ...(options.trackingNumber ? { trackingNumber: options.trackingNumber } : {}),
        },
      })
    }

    return { ...updated, allowedTransitions: ORDER_TRANSITIONS[status] }
  }

  /**
   * Shipments: the orders that left the warehouse, plus the resi on each.
   *
   * Listed as two groups in one payload because that is how the screen reads:
   * what still needs a tracking number, and what is already trackable.
   */
  async listShipments({
    search,
    status,
    missingTracking,
    page = 1,
    limit = 20,
  }: {
    search?: string
    status?: OrderStatus
    missingTracking?: boolean
    page?: number
    limit?: number
  }) {
    const take = Math.min(limit, 100)

    const where: Prisma.OrderWhereInput = {
      // `shippedAt` is the record that something actually was dispatched, so it
      // defines this list — not the status, which a refund can overwrite later.
      shippedAt: { not: null },
      ...(status ? { status } : {}),
      ...(missingTracking ? { trackingNumber: null } : {}),
    }
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { trackingNumber: { contains: search, mode: 'insensitive' } },
        { courier: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [orders, total, missing, inTransit, done] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          status: true,
          totalPrice: true,
          courier: true,
          trackingNumber: true,
          shippedAt: true,
          createdAt: true,
          shippingAddress: true,
          user: { select: { id: true, email: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { shippedAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { shippedAt: { not: null }, trackingNumber: null } }),
      this.prisma.order.count({ where: { shippedAt: { not: null }, status: 'SHIPPED' } }),
      this.prisma.order.count({ where: { shippedAt: { not: null }, status: 'DELIVERED' } }),
    ])

    return {
      items: orders.map(({ _count, shippingAddress, ...order }) => ({
        ...order,
        itemCount: _count.items,
        destination: destinationOf(shippingAddress),
      })),
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
      summary: { missingTracking: missing, inTransit, delivered: done },
    }
  }

  /**
   * Correct or fill in the resi of an order that has already been dispatched.
   * Restricted to shipped/delivered orders on purpose: an unshipped order has
   * no shipment to correct, and that transition is where the resi is authored.
   */
  async updateShipment(id: string, dto: { courier?: string; trackingNumber?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, shippedAt: true, userId: true },
    })
    if (!order) throw new NotFoundException('Order not found')

    if (order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
      throw new BadRequestException(
        `Only shipped or delivered orders carry a resi (current status: ${order.status})`,
      )
    }
    if (dto.courier === undefined && dto.trackingNumber === undefined) {
      throw new BadRequestException('Nothing to update: send courier and/or trackingNumber')
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.courier === undefined ? {} : { courier: dto.courier }),
        ...(dto.trackingNumber === undefined ? {} : { trackingNumber: dto.trackingNumber }),
      },
      select: {
        id: true,
        status: true,
        courier: true,
        trackingNumber: true,
        shippedAt: true,
      },
    })
  }

  // --------------------------------------------------------------- inventory

  /** Product stock with variants, held units and what is actually sellable. */
  async inventoryOverview({ lowOnly = false, search }: { lowOnly?: boolean; search?: string }) {
    const where: Prisma.ProductWhereInput = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: { select: { name: true } },
        variants: { orderBy: { sku: 'asc' } },
      },
      orderBy: { name: 'asc' },
      take: 200,
    })

    const reserved = await this.inventory.reservedMap(products.map((p) => p.id))
    const threshold = this.inventory.lowStockLimit

    const rows = products.map((product) => {
      const held = Math.min(reserved.get(product.id) ?? 0, product.stock)
      return {
        id: product.id,
        name: product.name,
        category: product.category.name,
        price: product.price,
        stock: product.stock,
        reserved: held,
        available: Math.max(product.stock - held, 0),
        variants: product.variants.map((variant) => ({
          sku: variant.sku,
          options: variant.options,
          stock: variant.stock,
        })),
      }
    })

    return {
      items: lowOnly ? rows.filter((row) => row.available <= threshold) : rows,
      threshold,
    }
  }

  // --------------------------------------------------------------- analytics

  /**
   * The E-Commerce screen. Every number here is derived from orders that were
   * actually paid for, so the page can be trusted the same way the order list
   * is.
   *
   * Two deliberate refusals to invent data:
   *
   * 1. There is no "profit" series. The catalog stores no cost price, so a
   *    profit curve could only be fabricated. The second series is refunds.
   *    Note that refunds are plotted as their own series rather than subtracted
   *    from revenue: an order that was refunded has already left the revenue
   *    series (which counts PAID/SHIPPED/DELIVERED only), so subtracting the
   *    refund again would count the same money twice.
   * 2. There is no conversion funnel of visitors/product views, because nothing
   *    records them. The funnel here is the order lifecycle (created → paid →
   *    shipped → delivered), which is real, with cancelled/refunded shown as the
   *    leak out of it.
   *
   * Money math runs in SQL with explicit ::float8 / ::int casts so the driver
   * returns plain numbers — Postgres SUM(numeric) arrives as a Decimal and
   * COUNT(*) as BigInt, neither of which survives JSON serialization.
   */
  async analytics() {
    const now = new Date()
    const months = 12
    const seriesStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
    const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const previousStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

    const [revenueRows, refundRows, topRows, categoryRows, funnel, windowTotals, previousTotals] =
      await Promise.all([
        this.prisma.$queryRaw<{ ym: string; revenue: number; orders: number }[]>`
          SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS ym,
                 COALESCE(SUM("totalPrice"), 0)::float8 AS revenue,
                 COUNT(*)::int AS orders
          FROM "orders"
          WHERE "status" IN ('PAID', 'SHIPPED', 'DELIVERED')
            AND "paidAt" >= ${seriesStart}
          GROUP BY 1
        `,
        this.prisma.$queryRaw<{ ym: string; refunds: number }[]>`
          SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS ym,
                 COALESCE(SUM("totalPrice"), 0)::float8 AS refunds
          FROM "orders"
          WHERE "status" = 'REFUNDED'
            AND "paidAt" >= ${seriesStart}
          GROUP BY 1
        `,
        // Units sold, ranked by volume. Revenue is the line total, not the
        // current catalog price, so a price change does not rewrite history.
        this.prisma.$queryRaw<
          { id: string; name: string; units: number; revenue: number }[]
        >`
          SELECT oi."productId" AS id,
                 MAX(oi."productName") AS name,
                 SUM(oi.quantity)::int AS units,
                 COALESCE(SUM(oi.price * oi.quantity), 0)::float8 AS revenue
          FROM "order_items" oi
          JOIN "orders" o ON o.id = oi."orderId"
          WHERE o."status" IN ('PAID', 'SHIPPED', 'DELIVERED')
            AND o."paidAt" >= ${seriesStart}
          GROUP BY oi."productId"
          ORDER BY units DESC, revenue DESC
          LIMIT 5
        `,
        // Inner join on products on purpose: an item whose product was deleted
        // has no category to attribute, and guessing one would be a lie.
        this.prisma.$queryRaw<{ name: string; units: number; revenue: number }[]>`
          SELECT c.name AS name,
                 SUM(oi.quantity)::int AS units,
                 COALESCE(SUM(oi.price * oi.quantity), 0)::float8 AS revenue
          FROM "order_items" oi
          JOIN "orders" o ON o.id = oi."orderId"
          JOIN "products" p ON p.id = oi."productId"
          JOIN "categories" c ON c.id = p."categoryId"
          WHERE o."status" IN ('PAID', 'SHIPPED', 'DELIVERED')
            AND o."paidAt" >= ${seriesStart}
          GROUP BY c.name
          ORDER BY revenue DESC
        `,
        this.orderFunnel(seriesStart),
        this.revenueWindow(previousStart, now),
        this.revenueWindow(previousStart, windowStart),
      ])

    const byMonth = new Map(revenueRows.map((row) => [row.ym, row]))
    const refundByMonth = new Map(refundRows.map((row) => [row.ym, row.refunds]))
    const labels: string[] = []
    const revenue: number[] = []
    const refunds: number[] = []
    const orders: number[] = []
    for (let i = 0; i < months; i++) {
      const date = new Date(Date.UTC(seriesStart.getUTCFullYear(), seriesStart.getUTCMonth() + i, 1))
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      labels.push(MONTH_LABELS[date.getUTCMonth()])
      revenue.push(round2(byMonth.get(key)?.revenue ?? 0))
      refunds.push(round2(refundByMonth.get(key) ?? 0))
      orders.push(byMonth.get(key)?.orders ?? 0)
    }

    return {
      range: {
        from: seriesStart.toISOString(),
        to: now.toISOString(),
        months,
        kpiWindowDays: 30,
      },
      kpis: {
        grossSales: windowTotals.grossSales,
        orders: windowTotals.orders,
        averageOrderValue: windowTotals.averageOrderValue,
        refunds: windowTotals.refunds,
        previous: previousTotals,
      },
      monthly: { labels, revenue, refunds, orders },
      topProducts: topRows.map((row) => ({
        id: row.id,
        name: row.name,
        unitsSold: row.units,
        revenue: round2(row.revenue),
      })),
      salesByCategory: categoryRows.map((row) => ({
        name: row.name,
        units: row.units,
        revenue: round2(row.revenue),
      })),
      funnel,
    }
  }

  /**
   * Orders that *reached* each stage, counted from facts rather than from the
   * current status alone:
   *
   * - paid uses `paidAt`, so an order refunded later still counts as having paid,
   * - shipped uses `shippedAt`, which the migration backfilled for orders that
   *   left the warehouse before this column existed,
   * - delivered has no timestamp, so it is read from the status.
   *
   * Consequence, stated rather than hidden: an order refunded *after* delivery
   * leaves the "delivered" step. It is reported in the leak instead.
   */
  private async orderFunnel(since: Date) {
    const base = { createdAt: { gte: since } }
    const [created, paid, shipped, delivered, cancelled, refunded] = await Promise.all([
      this.prisma.order.count({ where: base }),
      this.prisma.order.count({ where: { ...base, paidAt: { not: null } } }),
      this.prisma.order.count({ where: { ...base, shippedAt: { not: null } } }),
      this.prisma.order.count({ where: { ...base, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...base, status: 'CANCELLED' } }),
      this.prisma.order.count({ where: { ...base, status: 'REFUNDED' } }),
    ])

    return {
      stages: [
        { key: 'created', label: 'Pesanan dibuat', count: created },
        { key: 'paid', label: 'Pembayaran masuk', count: paid },
        { key: 'shipped', label: 'Dikirim', count: shipped },
        { key: 'delivered', label: 'Diterima', count: delivered },
      ],
      leak: { cancelled, refunded },
    }
  }

  /** Collected money and order count inside one window, for the KPI deltas. */
  private async revenueWindow(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<
      { gross: number; orders: number; refunds: number }[]
    >`
      SELECT
        COALESCE(SUM(CASE WHEN "status" IN ('PAID', 'SHIPPED', 'DELIVERED') THEN "totalPrice" END), 0)::float8 AS gross,
        COUNT(CASE WHEN "status" IN ('PAID', 'SHIPPED', 'DELIVERED') THEN 1 END)::int AS orders,
        COALESCE(SUM(CASE WHEN "status" = 'REFUNDED' THEN "totalPrice" END), 0)::float8 AS refunds
      FROM "orders"
      WHERE "paidAt" >= ${from} AND "paidAt" < ${to}
    `

    const row = rows[0] ?? { gross: 0, orders: 0, refunds: 0 }
    return {
      grossSales: round2(row.gross),
      orders: row.orders,
      averageOrderValue: row.orders > 0 ? round2(row.gross / row.orders) : 0,
      refunds: round2(row.refunds),
    }
  }

  // -------------------------------------------------------------- pencarian

  /**
   * One query, three answers: where does this text lead?
   *
   * Kept in the back-office service (not the public catalog) because the rows it
   * returns are admin rows: any order, any customer, any stock figure. Each group
   * is capped at `limit` and the response claims **no total** — a capped list
   * cannot honestly say how many matches exist. `matchedSkus` is filled only when
   * the text really hit a SKU, so the palette can show why a product showed up.
   *
   * Fields are flattened to what a row renders (category as its name, order
   * customer as `user`), never a raw relation — the palette prints this text
   * verbatim, so an object here would surface as "[object Object]".
   */
  async search({ q, limit = 5 }: { q: string; limit?: number }) {
    const take = Math.min(limit, 10)
    const text = q.trim()

    const [products, orders, customers] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: text, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: text, mode: 'insensitive' } } } },
          ],
        },
        // The category is selected as its name, not the relation, so the row
        // renders the same string the Produk screen shows instead of an object.
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          category: { select: { name: true } },
          variants: { select: { sku: true } },
        },
        orderBy: { name: 'asc' },
        take,
      }),
      this.prisma.order.findMany({
        where: {
          OR: [
            { id: { contains: text } },
            { user: { email: { contains: text, mode: 'insensitive' } } },
            { user: { name: { contains: text, mode: 'insensitive' } } },
          ],
        },
        select: {
          id: true,
          status: true,
          totalPrice: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          OR: [
            { email: { contains: text, mode: 'insensitive' } },
            { name: { contains: text, mode: 'insensitive' } },
          ],
        },
        select: { id: true, email: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ])

    const needle = text.toLowerCase()

    return {
      query: text,
      limit: take,
      products: products.map(({ variants, category, ...product }) => ({
        ...product,
        category: category?.name ?? null,
        matchedSkus: variants
          .map((variant) => variant.sku)
          .filter((sku) => sku.toLowerCase().includes(needle)),
      })),
      orders,
      customers,
    }
  }

  // --------------------------------------------------------------- customers

  async listCustomers({ search, page = 1, limit = 20 }: {
    search?: string
    page?: number
    limit?: number
  }) {
    const take = Math.min(limit, 100)
    const where: Prisma.UserWhereInput = { role: 'CUSTOMER' }
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.user.count({ where }),
    ])

    const spend = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) }, status: { in: COLLECTED } },
      _sum: { totalPrice: true },
      _count: { _all: true },
    })
    const spendByUser = new Map(spend.map((row) => [row.userId, row]))

    return {
      items: users.map(({ _count, ...user }) => ({
        ...user,
        ordersCount: _count.orders,
        collectedOrders: spendByUser.get(user.id)?._count._all ?? 0,
        totalSpent: round2(spendByUser.get(user.id)?._sum.totalPrice ?? 0),
      })),
      meta: { total, page, limit: take, totalPages: Math.ceil(total / take) },
    }
  }

  /**
   * One customer plus the orders that explain the numbers in the list.
   *
   * The counts come from a groupBy over the same COLLECTED set the list uses, so
   * opening the detail panel can never contradict the row that was clicked.
   */
  async getCustomer(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER' },
      select: { id: true, email: true, name: true, createdAt: true },
    })
    if (!user) throw new NotFoundException('Customer not found')

    // Plain Promise.all, not $transaction: these are two independent reads, and
    // Prisma's groupBy types do not survive being placed inside a $transaction
    // array (TS2615 circular reference).
    const [orders, grouped] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          totalPrice: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { userId: id },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
    ])

    const collected = grouped.filter((row) => COLLECTED.includes(row.status))

    return {
      customer: user,
      summary: {
        ordersCount: grouped.reduce((sum, row) => sum + row._count._all, 0),
        collectedOrders: collected.reduce((sum, row) => sum + row._count._all, 0),
        totalSpent: round2(collected.reduce((sum, row) => sum + (row._sum.totalPrice ?? 0), 0)),
        cancelledOrders: grouped.find((row) => row.status === 'CANCELLED')?._count._all ?? 0,
        refundedOrders: grouped.find((row) => row.status === 'REFUNDED')?._count._all ?? 0,
        lastOrderAt: orders[0]?.createdAt ?? null,
      },
      orders: orders.map(({ _count, ...order }) => ({ ...order, itemCount: _count.items })),
    }
  }

  // ------------------------------------------------------------- categories

  /**
   * Categories are the chips the storefront renders and the axis every product
   * hangs off, so the back-office owns them. The product form can only pick an
   * existing name (see ProductsService.resolveCategory), which is what stops a
   * typo from becoming a new chip in the storefront navigation.
   *
   * `productCount` is included because it is the only thing that tells an admin
   * whether a category can be deleted.
   */
  async listCategories({ search }: { search?: string }) {
    const where: Prisma.CategoryWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {}

    const rows = await this.prisma.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    })

    return {
      items: rows.map(({ _count, ...category }) => ({
        ...category,
        productCount: _count.products,
      })),
    }
  }

  async createCategory(name: string) {
    const trimmed = name.trim()
    const slug = this.requireSlug(trimmed)
    await this.assertCategoryFree(trimmed, slug)
    return this.prisma.category.create({ data: { name: trimmed, slug } })
  }

  async renameCategory(id: string, name: string) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Category not found')

    const trimmed = name.trim()
    const slug = this.requireSlug(trimmed)
    await this.assertCategoryFree(trimmed, slug, id)

    return this.prisma.category.update({
      where: { id },
      data: { name: trimmed, slug },
    })
  }

  /**
   * Only empty categories can go. Product.categoryId is onDelete: Restrict, so
   * deleting one in use would surface as an opaque P2003 — checking first lets
   * the admin see how many products still point at it.
   */
  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { products: true } } },
    })
    if (!category) throw new NotFoundException('Category not found')

    if (category._count.products > 0) {
      throw new ConflictException(
        `"${category.name}" is still used by ${category._count.products} product(s). ` +
          'Move them to another category first.',
      )
    }

    await this.prisma.category.delete({ where: { id } })
    return { id, name: category.name, deleted: true }
  }

  // ------------------------------------------------------------------ brands

  /**
   * Brands own two storefront surfaces: the cards in "Top Fashion Brands" and
   * the pages at /brands/<slug>. They are managed here for the same reason
   * categories are — the product form may only pick a label that already
   * exists, so a typo cannot publish an empty brand page.
   */
  async listBrands({ search }: { search?: string }) {
    const where: Prisma.BrandWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {}

    const rows = await this.prisma.brand.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    })

    return {
      items: rows.map(({ _count, ...brand }) => ({ ...brand, productCount: _count.products })),
    }
  }

  async createBrand(name: string) {
    const trimmed = name.trim()
    const slug = this.requireSlug(trimmed, 'Brand')
    await this.assertBrandFree(trimmed, slug)
    return this.prisma.brand.create({ data: { name: trimmed, slug } })
  }

  async renameBrand(id: string, name: string) {
    const existing = await this.prisma.brand.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new NotFoundException('Brand not found')

    const trimmed = name.trim()
    const slug = this.requireSlug(trimmed, 'Brand')
    await this.assertBrandFree(trimmed, slug, id)

    return this.prisma.brand.update({ where: { id }, data: { name: trimmed, slug } })
  }

  /**
   * Only unused brands can go. `Product.brandId` is onDelete: SetNull, so
   * deleting one in use would silently strip the label from every product that
   * carried it — and those products would drop off the brand page without the
   * admin ever being told. Refusing with a count keeps that decision visible.
   */
  async deleteBrand(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { products: true } } },
    })
    if (!brand) throw new NotFoundException('Brand not found')

    if (brand._count.products > 0) {
      throw new ConflictException(
        `"${brand.name}" is still used by ${brand._count.products} product(s). ` +
          'Clear the brand on those products first.',
      )
    }

    await this.prisma.brand.delete({ where: { id } })
    return { id, name: brand.name, deleted: true }
  }

  /** Name and slug are both unique — report which one clashed instead of P2002. */
  private async assertBrandFree(name: string, slug: string, ignoreId?: string) {
    const clash = await this.prisma.brand.findFirst({
      where: {
        OR: [{ name }, { slug }],
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { name: true },
    })
    if (clash) throw new ConflictException(`Brand "${clash.name}" already exists`)
  }

  /** The slug drives the storefront URL, so a slug-less name must not be stored. */
  private requireSlug(name: string, label = 'Category'): string {
    const slug = slugify(name)
    if (!slug) {
      throw new BadRequestException(`${label} name must contain letters or numbers`)
    }
    return slug
  }

  /** Name and slug are both unique — report which one clashed instead of P2002. */
  private async assertCategoryFree(name: string, slug: string, ignoreId?: string) {
    const clash = await this.prisma.category.findFirst({
      where: {
        OR: [{ name }, { slug }],
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { name: true },
    })
    if (clash) throw new ConflictException(`Category "${clash.name}" already exists`)
  }

  // ---------------------------------------------------------------- coupons

  /**
   * The discount rules themselves live in CouponService (it is what checkout
   * calls). This surface only shapes the records, but it reports the same
   * lifecycle the redemption path enforces — active, expired, exhausted — so an
   * admin never sees a coupon that looks usable but will be rejected at payment.
   */
  async listCoupons({ search, activeOnly = false }: { search?: string; activeOnly?: boolean }) {
    const where: Prisma.CouponWhereInput = {}
    if (activeOnly) where.active = true
    if (search) where.code = { contains: search, mode: 'insensitive' }

    const coupons = await this.prisma.coupon.findMany({ where, orderBy: { code: 'asc' } })
    const presented = coupons.map((coupon) => this.presentCoupon(coupon))

    return {
      items: presented,
      summary: {
        total: presented.length,
        active: presented.filter((c) => c.status === 'AKTIF').length,
        expired: presented.filter((c) => c.status === 'KEDALUWARSA').length,
        exhausted: presented.filter((c) => c.status === 'HABIS').length,
        redemptions: presented.reduce((sum, c) => sum + c.usedCount, 0),
      },
    }
  }

  async createCoupon(dto: CreateCouponDto) {
    const code = normalizeCouponCode(dto.code)
    assertCouponValue(dto.type, dto.value)
    await this.assertCouponCodeFree(code)

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        type: dto.type,
        value: dto.value,
        minPurchase: dto.minPurchase ?? null,
        maxDiscount: dto.maxDiscount ?? null,
        usageLimit: dto.usageLimit ?? null,
        expiresAt: parseExpiry(dto.expiresAt),
        active: dto.active ?? true,
      },
    })

    return this.presentCoupon(coupon)
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Coupon not found')

    // Validate against the value that will actually be stored, not just the patch.
    const type = (dto.type ?? existing.type) as CouponType
    const value = dto.value ?? existing.value
    assertCouponValue(type, value)

    if (dto.usageLimit != null && dto.usageLimit < existing.usedCount) {
      throw new BadRequestException(
        `Usage limit cannot be lower than the ${existing.usedCount} redemption(s) already recorded`,
      )
    }

    const data: Prisma.CouponUpdateInput = {}
    if (dto.code !== undefined) {
      const code = normalizeCouponCode(dto.code)
      await this.assertCouponCodeFree(code, id)
      data.code = code
    }
    if (dto.type !== undefined) data.type = dto.type
    if (dto.value !== undefined) data.value = dto.value
    if (dto.minPurchase !== undefined) data.minPurchase = dto.minPurchase
    if (dto.maxDiscount !== undefined) data.maxDiscount = dto.maxDiscount
    if (dto.usageLimit !== undefined) data.usageLimit = dto.usageLimit
    if (dto.expiresAt !== undefined) data.expiresAt = parseExpiry(dto.expiresAt)
    if (dto.active !== undefined) data.active = dto.active

    const coupon = await this.prisma.coupon.update({ where: { id }, data })
    return this.presentCoupon(coupon)
  }

  /**
   * A redeemed coupon is never deleted: CouponUsage rows cascade, which would
   * erase the redemption history and quietly hand the code back to customers
   * who already used it. Deactivating keeps both the audit trail and the block.
   */
  async deleteCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, usedCount: true },
    })
    if (!coupon) throw new NotFoundException('Coupon not found')

    if (coupon.usedCount > 0) {
      throw new ConflictException(
        `Coupon "${coupon.code}" has been redeemed ${coupon.usedCount} time(s). ` +
          'Deactivate it instead of deleting, so the history stays.',
      )
    }

    await this.prisma.coupon.delete({ where: { id } })
    return { id, code: coupon.code, deleted: true }
  }

  private async assertCouponCodeFree(code: string, ignoreId?: string) {
    const clash = await this.prisma.coupon.findUnique({ where: { code }, select: { id: true } })
    if (clash && clash.id !== ignoreId) {
      throw new ConflictException(`Coupon "${code}" already exists`)
    }
  }

  /** Mirrors the order CouponService.resolveCoupon applies its checks in. */
  private couponState(coupon: {
    active: boolean
    expiresAt: Date | null
    usageLimit: number | null
    usedCount: number
  }): CouponStatus {
    if (!coupon.active) return 'NONAKTIF'
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return 'KEDALUWARSA'
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return 'HABIS'
    return 'AKTIF'
  }

  private presentCoupon<T extends {
    active: boolean
    expiresAt: Date | null
    usageLimit: number | null
    usedCount: number
  }>(coupon: T) {
    return { ...coupon, status: this.couponState(coupon) }
  }
}
