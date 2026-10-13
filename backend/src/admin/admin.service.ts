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
    reason?: string,
  ) {
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
          data: { status },
          include: { items: true, payments: { orderBy: { createdAt: 'desc' } } },
        })
      },
      { timeout: 15000 },
    )

    const template = STATUS_NOTIFICATIONS[status]
    if (template) {
      await this.notifications.notify({
        userId: order.userId,
        type: template.type,
        title: template.title,
        body: template.body(order.id.slice(0, 8)),
        meta: { orderId: order.id, status },
      })
    }

    return { ...updated, allowedTransitions: ORDER_TRANSITIONS[status] }
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

  /** The slug drives the storefront URL, so a slug-less name must not be stored. */
  private requireSlug(name: string): string {
    const slug = slugify(name)
    if (!slug) {
      throw new BadRequestException('Category name must contain letters or numbers')
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
