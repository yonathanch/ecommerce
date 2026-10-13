import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'

type Db = PrismaService | Prisma.TransactionClient

export interface ReservationItem {
  productId: string
  productName: string
  quantity: number
}

export interface LedgerMovement {
  productId: string
  variantSku?: string | null
  quantity: number
  stockBefore: number
  stockAfter: number
}

export interface LowStockRow {
  productId: string
  name: string
  stock: number
  reserved: number
  available: number
}

/** Default hold window for an unpaid order; overridable per environment. */
const DEFAULT_TTL_MINUTES = 30

/**
 * Inventory is the only module allowed to move stock.
 *
 * Two separate histories, deliberately:
 * - `stock_reservations` records the *hold* lifecycle of an unpaid order
 *   (ACTIVE -> CONSUMED | RELEASED). A hold never changes `Product.stock`, it
 *   only lowers availability, so a checkout cannot destroy sellable inventory.
 * - `inventory_transactions` is the on-hand ledger (DEDUCT / RESTOCK / ADJUST);
 *   every row is a real change of the physical quantity with before/after.
 *
 * Concurrency: every path that reads availability takes a row lock on the
 * product (`SELECT ... FOR UPDATE`) inside the caller's transaction, which
 * serializes concurrent checkouts of the same product. Products are locked in
 * a stable (sorted) order so two multi-item checkouts cannot deadlock.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private get lowStockThreshold(): number {
    const configured = Number(process.env.LOW_STOCK_THRESHOLD)
    return Number.isInteger(configured) && configured >= 0 ? configured : 5
  }

  /** Threshold exposed for the admin dashboard (env-driven). */
  get lowStockLimit(): number {
    return this.lowStockThreshold
  }

  private get ttlMinutes(): number {
    const configured = Number(process.env.STOCK_RESERVATION_TTL_MINUTES)
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_MINUTES
  }

  // ------------------------------------------------------------------ reads

  /** Reserved (held) units for one product. Expired holds do not count. */
  async reservedQuantity(productId: string, db: Db = this.prisma): Promise<number> {
    const result = await db.stockReservation.aggregate({
      where: { productId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      _sum: { quantity: true },
    })
    return result._sum.quantity ?? 0
  }

  /** Reserved units grouped by product, for catalog responses (avoids N+1). */
  async reservedMap(productIds: string[], db: Db = this.prisma): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map()

    const rows = await db.stockReservation.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    })

    return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]))
  }

  async availability(productId: string, db: Db = this.prisma) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stock: true },
    })
    if (!product) throw new NotFoundException('Product not found')

    const reserved = await this.reservedQuantity(productId, db)
    return {
      productId: product.id,
      name: product.name,
      stock: product.stock,
      reserved,
      available: Math.max(product.stock - reserved, 0),
    }
  }

  async lowStock(threshold?: number, db: Db = this.prisma): Promise<LowStockRow[]> {
    const limit = threshold ?? this.lowStockThreshold

    const products = await db.product.findMany({
      select: { id: true, name: true, stock: true },
      orderBy: { stock: 'asc' },
    })
    const reserved = await this.reservedMap(
      products.map((p) => p.id),
      db,
    )

    return products
      .map((p) => {
        const held = reserved.get(p.id) ?? 0
        return {
          productId: p.id,
          name: p.name,
          stock: p.stock,
          reserved: held,
          available: Math.max(p.stock - held, 0),
        }
      })
      .filter((row) => row.available <= limit)
      .sort((a, b) => a.available - b.available)
  }

  async history(
    { productId, take = 100 }: { productId?: string; take?: number },
    db: Db = this.prisma,
  ) {
    return db.inventoryTransaction.findMany({
      where: productId ? { productId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    })
  }

  // ------------------------------------------------------------ reservation

  /** Locks a product row and returns its on-hand stock. */
  private async lockProduct(tx: Prisma.TransactionClient, productId: string) {
    const rows = await tx.$queryRaw<{ id: string; stock: number }[]>`
      SELECT "id", "stock" FROM "products" WHERE "id" = ${productId} FOR UPDATE
    `
    if (rows.length === 0) throw new NotFoundException('Product not found')
    return rows[0]
  }

  /** Expired holds on these products stop counting against availability. */
  private async releaseExpiredFor(
    tx: Prisma.TransactionClient,
    productIds: string[],
  ): Promise<number> {
    if (productIds.length === 0) return 0

    const result = await tx.stockReservation.updateMany({
      where: {
        productId: { in: productIds },
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'RELEASED', releasedAt: new Date() },
    })
    return result.count
  }

  /**
   * Holds stock for an order. Must run inside the order-creation transaction:
   * if the order insert fails, the holds roll back with it.
   */
  async reserveForOrder(
    tx: Prisma.TransactionClient,
    input: { orderId: string; userId: string; items: ReservationItem[] },
  ) {
    // Stable lock order across concurrent checkouts.
    const items = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000)

    await this.releaseExpiredFor(
      tx,
      items.map((i) => i.productId),
    )

    const reservations: { productId: string; quantity: number; available: number }[] = []

    for (const item of items) {
      const product = await this.lockProduct(tx, item.productId)
      const held = await this.reservedQuantity(item.productId, tx)
      const available = Math.max(product.stock - held, 0)

      if (item.quantity > available) {
        throw new BadRequestException(
          `Insufficient available stock for ${item.productName}. Available: ${available}`,
        )
      }

      await tx.stockReservation.create({
        data: {
          orderId: input.orderId,
          productId: item.productId,
          userId: input.userId,
          quantity: item.quantity,
          status: 'ACTIVE',
          expiresAt,
        },
      })

      reservations.push({
        productId: item.productId,
        quantity: item.quantity,
        available: available - item.quantity,
      })
    }

    return { reservations, expiresAt }
  }

  /**
   * Payment captured: convert holds into an on-hand deduction.
   * The conditional UPDATE is the last line of defence against overselling.
   */
  async consumeForOrder(
    tx: Prisma.TransactionClient,
    { orderId, userId, reason = 'payment-captured' }: { orderId: string; userId: string; reason?: string },
  ) {
    const holds = await tx.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      orderBy: { productId: 'asc' },
    })
    if (holds.length === 0) {
      throw new BadRequestException('This order has no active stock reservation')
    }

    const movements: LedgerMovement[] = []

    for (const hold of holds) {
      const rows = await tx.$queryRaw<{ stock: number }[]>`
        UPDATE "products"
        SET "stock" = "stock" - ${hold.quantity}, "updatedAt" = now()
        WHERE "id" = ${hold.productId} AND "stock" >= ${hold.quantity}
        RETURNING "stock"
      `

      if (rows.length === 0) {
        const current = await tx.product.findUnique({
          where: { id: hold.productId },
          select: { name: true, stock: true },
        })
        throw new BadRequestException(
          `Stock for ${current?.name ?? hold.productId} is no longer sufficient (available: ${current?.stock ?? 0})`,
        )
      }

      await tx.stockReservation.update({
        where: { id: hold.id },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      })

      movements.push({
        productId: hold.productId,
        quantity: hold.quantity,
        stockBefore: rows[0].stock + hold.quantity,
        stockAfter: rows[0].stock,
      })
    }

    await this.writeLedger(tx, movements, { type: 'DEDUCT', userId, orderId, reason })

    return movements
  }

  /**
   * Refund / RMA: put captured units back on the shelf. Only reachable for
   * orders whose stock was already deducted (PAID and beyond), and REFUNDED is
   * a terminal status, so a restock can never be applied twice.
   */
  async restockForOrder(
    tx: Prisma.TransactionClient,
    { orderId, userId, reason }: { orderId: string; userId: string; reason: string },
  ) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
      orderBy: { productId: 'asc' },
    })
    if (items.length === 0) {
      throw new BadRequestException('This order has no items to restock')
    }

    const movements: LedgerMovement[] = []

    for (const item of items) {
      const rows = await tx.$queryRaw<{ stock: number }[]>`
        UPDATE "products"
        SET "stock" = "stock" + ${item.quantity}, "updatedAt" = now()
        WHERE "id" = ${item.productId}
        RETURNING "stock"
      `
      if (rows.length === 0) {
        // Catalog entry was deleted since purchase: skip its ledger row instead
        // of failing the whole refund.
        continue
      }

      movements.push({
        productId: item.productId,
        quantity: item.quantity,
        stockBefore: rows[0].stock - item.quantity,
        stockAfter: rows[0].stock,
      })
    }

    await this.writeLedger(tx, movements, { type: 'RESTOCK', userId, orderId, reason })

    return movements
  }

  /** Order cancelled or expired: drop the holds (on-hand stock was never touched). */
  async releaseForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<number> {
    const result = await tx.stockReservation.updateMany({
      where: { orderId, status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    })
    return result.count
  }

  private async writeLedger(
    db: Db,
    movements: LedgerMovement[],
    meta: {
      type: 'DEDUCT' | 'RESTOCK' | 'ADJUST'
      userId: string
      orderId?: string
      reason: string
    },
  ) {
    if (movements.length === 0) return

    await db.inventoryTransaction.createMany({
      data: movements.map((movement) => ({
        productId: movement.productId,
        variantSku: movement.variantSku ?? null,
        orderId: meta.orderId ?? null,
        userId: meta.userId,
        type: meta.type,
        quantity: movement.quantity,
        stockBefore: movement.stockBefore,
        stockAfter: movement.stockAfter,
        reason: meta.reason,
      })),
    })
  }

  // -------------------------------------------------------------- admin ops

  /**
   * Manual stock correction (admin). `delta` is signed; stock can never go
   * below zero, which the conditional UPDATE enforces atomically.
   */
  async adjust(input: {
    productId: string
    variantSku?: string
    delta: number
    reason: string
    userId: string
  }) {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw new BadRequestException('delta must be a non-zero whole number')
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.variantSku) {
        const variant = await tx.productVariant.findUnique({
          where: { sku: input.variantSku },
          select: { id: true, productId: true, stock: true },
        })
        if (!variant || variant.productId !== input.productId) {
          throw new NotFoundException('Variant not found for this product')
        }
        if (variant.stock + input.delta < 0) {
          throw new BadRequestException(
            `Adjustment would make variant stock negative (current: ${variant.stock})`,
          )
        }

        const updated = await tx.productVariant.update({
          where: { id: variant.id },
          data: { stock: variant.stock + input.delta },
          select: { stock: true },
        })

        await this.writeLedger(
          tx,
          [
            {
              productId: input.productId,
              variantSku: input.variantSku,
              quantity: Math.abs(input.delta),
              stockBefore: variant.stock,
              stockAfter: updated.stock,
            },
          ],
          { type: 'ADJUST', userId: input.userId, reason: input.reason },
        )

        return { productId: input.productId, variantSku: input.variantSku, stock: updated.stock }
      }

      const rows = await tx.$queryRaw<{ name: string; stock: number }[]>`
        UPDATE "products"
        SET "stock" = "stock" + ${input.delta}, "updatedAt" = now()
        WHERE "id" = ${input.productId} AND "stock" + ${input.delta} >= 0
        RETURNING "name", "stock"
      `

      if (rows.length === 0) {
        const current = await tx.product.findUnique({
          where: { id: input.productId },
          select: { stock: true },
        })
        if (!current) throw new NotFoundException('Product not found')
        throw new BadRequestException(
          `Adjustment would make stock negative (current: ${current.stock})`,
        )
      }

      await this.writeLedger(
        tx,
        [
          {
            productId: input.productId,
            quantity: Math.abs(input.delta),
            stockBefore: rows[0].stock - input.delta,
            stockAfter: rows[0].stock,
          },
        ],
        { type: 'ADJUST', userId: input.userId, reason: input.reason },
      )

      await this.alertIfLowStock(tx, [input.productId])

      return { productId: input.productId, stock: rows[0].stock }
    })
  }

  /** Creates admin notifications for products that dropped to/below threshold. */
  async alertIfLowStock(db: Db, productIds: string[]) {
    if (productIds.length === 0) return 0

    const low = (await this.lowStock(undefined, db)).filter((row) =>
      productIds.includes(row.productId),
    )

    for (const row of low) {
      await this.notifications.notifyAdmins(
        {
          type: 'LOW_STOCK',
          title: `Stok menipis: ${row.name}`,
          body: `Sisa ${row.available} unit (stok ${row.stock}, tertahan ${row.reserved}). Ambang batas ${this.lowStockThreshold}.`,
          meta: { productId: row.productId, stock: row.stock, reserved: row.reserved },
        },
        db,
      )
    }

    return low.length
  }
}
