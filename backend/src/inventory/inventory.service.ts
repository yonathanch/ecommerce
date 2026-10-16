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
  /**
   * Chosen variant SKU. When present the hold draws from that variant's own
   * stock; when absent it is a base-product hold, which is only legal for
   * products that have no variants at all.
   */
  variantSku?: string
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
 * Stock comes in two shapes:
 * - A product *without* variants carries its own `Product.stock`. This is the
 *   simple case: holds, deductions and availability all read that one column.
 * - A product *with* variants derives its `Product.stock` from the sum of its
 *   variants' stock. Every variant movement mirrors onto the product row so the
 *   catalog-level number stays correct, but the variant column is the single
 *   source of truth. A hold on such a product must name a variant.
 *
 * Two separate histories, deliberately:
 * - `stock_reservations` records the *hold* lifecycle of an unpaid order
 *   (ACTIVE -> CONSUMED | RELEASED). A hold never changes stock, it only lowers
 *   availability, so a checkout cannot destroy sellable inventory.
 * - `inventory_transactions` is the on-hand ledger (DEDUCT / RESTOCK / ADJUST);
 *   every row is a real change of the physical quantity with before/after.
 *
 * Concurrency: every path that reads availability takes a row lock on the
 * product (`SELECT ... FOR UPDATE`) inside the caller's transaction, and a
 * variant hold locks its variant row too, which serializes concurrent checkouts
 * of the same product/variant. Products are locked in a stable (sorted) order
 * and a variant is always locked after its product, so two multi-item checkouts
 * cannot deadlock.
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

  /**
   * Held units for one product across all of its variants (and any base
   * hold). Expired holds do not count. This is what the catalog-level
   * availability display needs.
   */
  async reservedQuantity(productId: string, db: Db = this.prisma): Promise<number> {
    const result = await db.stockReservation.aggregate({
      where: { productId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      _sum: { quantity: true },
    })
    return result._sum.quantity ?? 0
  }

  /** Held units for one specific variant of a product. */
  async reservedVariantQuantity(
    productId: string,
    variantSku: string,
    db: Db = this.prisma,
  ): Promise<number> {
    const result = await db.stockReservation.aggregate({
      where: {
        productId,
        variantSku,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
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

  /** Reserved units grouped by "productId::variantSku", for the product page. */
  async reservedVariantMap(
    productIds: string[],
    db: Db = this.prisma,
  ): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map()

    const rows = await db.stockReservation.groupBy({
      by: ['productId', 'variantSku'],
      where: {
        productId: { in: productIds },
        variantSku: { not: '' },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    })

    return new Map(
      rows.map((row) => [
        `${row.productId}::${row.variantSku}`,
        row._sum.quantity ?? 0,
      ]),
    )
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

  /** Availability for one variant: its own stock minus holds on that SKU. */
  async variantAvailability(
    productId: string,
    variantSku: string,
    db: Db = this.prisma,
  ) {
    const variant = await db.productVariant.findFirst({
      where: { productId, sku: variantSku },
      select: { sku: true, stock: true },
    })
    if (!variant) throw new NotFoundException('Variant not found for this product')

    const reserved = await this.reservedVariantQuantity(productId, variantSku, db)
    return {
      productId,
      variantSku: variant.sku,
      stock: variant.stock,
      reserved,
      available: Math.max(variant.stock - reserved, 0),
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

  /**
   * Locks a variant row (after its product is already locked) and returns its
   * on-hand stock, verifying it belongs to the expected product.
   */
  private async lockVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    variantSku: string,
  ) {
    const rows = await tx.$queryRaw<{ id: string; stock: number }[]>`
      SELECT "id", "stock" FROM "product_variants"
      WHERE "sku" = ${variantSku} AND "productId" = ${productId}
      FOR UPDATE
    `
    if (rows.length === 0) {
      throw new NotFoundException('Variant not found for this product')
    }
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
    // Stable lock order across concurrent checkouts: product, then variant.
    const items = [...input.items].sort(
      (a, b) =>
        a.productId.localeCompare(b.productId) ||
        (a.variantSku ?? '').localeCompare(b.variantSku ?? ''),
    )
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000)

    await this.releaseExpiredFor(
      tx,
      items.map((i) => i.productId),
    )

    const reservations: {
      productId: string
      variantSku?: string
      quantity: number
      available: number
    }[] = []

    for (const item of items) {
      const product = await this.lockProduct(tx, item.productId)

      if (item.variantSku) {
        const variant = await this.lockVariant(tx, item.productId, item.variantSku)
        const held = await this.reservedVariantQuantity(
          item.productId,
          item.variantSku,
          tx,
        )
        const available = Math.max(variant.stock - held, 0)

        if (item.quantity > available) {
          throw new BadRequestException(
            `Insufficient available stock for ${item.productName} (${item.variantSku}). Available: ${available}`,
          )
        }

        await tx.stockReservation.create({
          data: {
            orderId: input.orderId,
            productId: item.productId,
            variantSku: item.variantSku,
            userId: input.userId,
            quantity: item.quantity,
            status: 'ACTIVE',
            expiresAt,
          },
        })

        reservations.push({
          productId: item.productId,
          variantSku: item.variantSku,
          quantity: item.quantity,
          available: available - item.quantity,
        })
        continue
      }

      // Base-product hold. Once a product has variants its stock is the sum of
      // them, so an unattributed hold would take from a phantom pool — the
      // buyer has to name a variant instead.
      const variantCount = await tx.productVariant.count({
        where: { productId: item.productId },
      })
      if (variantCount > 0) {
        throw new BadRequestException(
          `${item.productName} has variants — choose one before checkout`,
        )
      }

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
          variantSku: '',
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
      orderBy: [{ productId: 'asc' }, { variantSku: 'asc' }],
    })
    if (holds.length === 0) {
      throw new BadRequestException('This order has no active stock reservation')
    }

    const movements: LedgerMovement[] = []

    for (const hold of holds) {
      if (hold.variantSku) {
        movements.push(await this.consumeVariant(tx, hold))
        continue
      }
      movements.push(await this.consumeProduct(tx, hold))
    }

    await this.writeLedger(tx, movements, { type: 'DEDUCT', userId, orderId, reason })

    return movements
  }

  /** Deduct a single variant's stock, mirroring onto the product-level sum. */
  private async consumeVariant(
    tx: Prisma.TransactionClient,
    hold: { id: string; productId: string; variantSku: string; quantity: number },
  ): Promise<LedgerMovement> {
    const variantRows = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE "product_variants"
      SET "stock" = "stock" - ${hold.quantity}, "updatedAt" = now()
      WHERE "sku" = ${hold.variantSku} AND "productId" = ${hold.productId} AND "stock" >= ${hold.quantity}
      RETURNING "stock"
    `

    if (variantRows.length === 0) {
      const variant = await tx.productVariant.findFirst({
        where: { productId: hold.productId, sku: hold.variantSku },
        select: { stock: true },
      })
      throw new BadRequestException(
        `Stock for variant ${hold.variantSku} is no longer sufficient (available: ${variant?.stock ?? 0})`,
      )
    }

    // Keep the derived product-level total in step with the variant we just sold.
    await tx.$queryRaw`
      UPDATE "products"
      SET "stock" = "stock" - ${hold.quantity}, "updatedAt" = now()
      WHERE "id" = ${hold.productId}
    `

    await tx.stockReservation.update({
      where: { id: hold.id },
      data: { status: 'CONSUMED', consumedAt: new Date() },
    })

    return {
      productId: hold.productId,
      variantSku: hold.variantSku,
      quantity: hold.quantity,
      stockBefore: variantRows[0].stock + hold.quantity,
      stockAfter: variantRows[0].stock,
    }
  }

  /** Deduct a base-product's stock (only used for products with no variants). */
  private async consumeProduct(
    tx: Prisma.TransactionClient,
    hold: { id: string; productId: string; quantity: number },
  ): Promise<LedgerMovement> {
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

    return {
      productId: hold.productId,
      quantity: hold.quantity,
      stockBefore: rows[0].stock + hold.quantity,
      stockAfter: rows[0].stock,
    }
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
      select: { productId: true, variantSku: true, quantity: true },
      orderBy: [{ productId: 'asc' }, { variantSku: 'asc' }],
    })
    if (items.length === 0) {
      throw new BadRequestException('This order has no items to restock')
    }

    const movements: LedgerMovement[] = []

    for (const item of items) {
      if (item.variantSku) {
        const movement = await this.restockVariant(tx, item)
        if (movement) movements.push(movement)
        continue
      }
      const movement = await this.restockProduct(tx, item)
      if (movement) movements.push(movement)
    }

    await this.writeLedger(tx, movements, { type: 'RESTOCK', userId, orderId, reason })

    return movements
  }

  /** Return units to a variant, mirroring onto the product-level sum. */
  private async restockVariant(
    tx: Prisma.TransactionClient,
    item: { productId: string; variantSku: string; quantity: number },
  ): Promise<LedgerMovement | null> {
    const rows = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE "product_variants"
      SET "stock" = "stock" + ${item.quantity}, "updatedAt" = now()
      WHERE "sku" = ${item.variantSku} AND "productId" = ${item.productId}
      RETURNING "stock"
    `
    // Variant was deleted since the purchase: nothing to put back, so skip it
    // rather than failing the whole refund (same policy as a deleted product).
    if (rows.length === 0) return null

    await tx.$queryRaw`
      UPDATE "products"
      SET "stock" = "stock" + ${item.quantity}, "updatedAt" = now()
      WHERE "id" = ${item.productId}
    `

    return {
      productId: item.productId,
      variantSku: item.variantSku,
      quantity: item.quantity,
      stockBefore: rows[0].stock - item.quantity,
      stockAfter: rows[0].stock,
    }
  }

  /** Return units to a base-product's stock. */
  private async restockProduct(
    tx: Prisma.TransactionClient,
    item: { productId: string; quantity: number },
  ): Promise<LedgerMovement | null> {
    const rows = await tx.$queryRaw<{ stock: number }[]>`
      UPDATE "products"
      SET "stock" = "stock" + ${item.quantity}, "updatedAt" = now()
      WHERE "id" = ${item.productId}
      RETURNING "stock"
    `
    if (rows.length === 0) {
      // Catalog entry was deleted since purchase: skip its ledger row instead
      // of failing the whole refund.
      return null
    }

    return {
      productId: item.productId,
      quantity: item.quantity,
      stockBefore: rows[0].stock - item.quantity,
      stockAfter: rows[0].stock,
    }
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
   *
   * On a product with variants, only a variant-level correction is allowed —
   * the product row is the derived sum, so touching it directly would silently
   * drift out of step with the SKUs that actually make it up.
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
      const variantSku = input.variantSku
      if (variantSku) {
        return this.adjustVariant(tx, { ...input, variantSku })
      }

      // A product-level adjustment on a variant product would desync the derived
      // total, so it is rejected in favour of adjusting a specific SKU.
      const variantCount = await tx.productVariant.count({
        where: { productId: input.productId },
      })
      if (variantCount > 0) {
        throw new BadRequestException(
          'This product has variants — adjust a specific variant SKU instead',
        )
      }

      return this.adjustProduct(tx, input)
    })
  }

  private async adjustVariant(
    tx: Prisma.TransactionClient,
    input: { productId: string; variantSku: string; delta: number; reason: string; userId: string },
  ) {
    const variant = await tx.productVariant.findFirst({
      where: { productId: input.productId, sku: input.variantSku },
      select: { id: true, productId: true, stock: true },
    })
    if (!variant) {
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

    // Keep the derived product-level total in step with the variant.
    await tx.$queryRaw`
      UPDATE "products"
      SET "stock" = "stock" + ${input.delta}, "updatedAt" = now()
      WHERE "id" = ${input.productId} AND "stock" + ${input.delta} >= 0
    `

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

    await this.alertIfLowStock(tx, [input.productId])

    return { productId: input.productId, variantSku: input.variantSku, stock: updated.stock }
  }

  private async adjustProduct(
    tx: Prisma.TransactionClient,
    input: { productId: string; delta: number; reason: string; userId: string },
  ) {
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
