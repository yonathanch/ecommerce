import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface ValidateCouponRequest {
  code: string
  subtotal: number
}

export interface CouponValidationResult {
  coupon: {
    code: string
    type: string
    value: number
    minPurchase?: number | null
    maxDiscount?: number | null
    usageLimit?: number | null
    expiresAt?: Date | null
  }
  discount: number
  finalAmount: number
  message: string
}

type Db = PrismaService | Prisma.TransactionClient

const round2 = (n: number) => Math.round(n * 100) / 100

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a coupon for a given subtotal.
   *
   * Pass `userId` to enforce one use per user, and `tx` to read inside the
   * checkout transaction so the decision and the write see the same snapshot.
   */
  async resolveCoupon(
    code: string,
    subtotal: number,
    { userId, tx }: { userId?: string; tx?: Prisma.TransactionClient } = {},
  ): Promise<CouponValidationResult & { couponId: string }> {
    const db: Db = tx ?? this.prisma

    const coupon = await db.coupon.findUnique({
      where: { code: (code ?? '').toUpperCase().trim() },
    })

    if (!coupon) throw new NotFoundException('Coupon not found')
    if (!coupon.active) throw new BadRequestException('Coupon is no longer active')
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired')
    }
    if (subtotal <= 0) throw new BadRequestException('Nothing to discount')
    if (subtotal < (coupon.minPurchase ?? 0)) {
      throw new BadRequestException(
        `Minimum purchase of ${coupon.minPurchase} not met`,
      )
    }
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached')
    }

    if (userId) {
      const alreadyUsed = await db.couponUsage.findUnique({
        where: { couponId_userId: { couponId: coupon.id, userId } },
        select: { id: true },
      })
      if (alreadyUsed) {
        throw new BadRequestException('You have already used this coupon')
      }
    }

    let discount =
      coupon.type === 'PERCENT'
        ? round2(subtotal * (coupon.value / 100))
        : round2(coupon.value)
    discount = Math.min(discount, subtotal)
    if (coupon.maxDiscount !== null) {
      discount = Math.min(discount, coupon.maxDiscount)
    }
    discount = round2(discount)

    return {
      couponId: coupon.id,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minPurchase: coupon.minPurchase,
        maxDiscount: coupon.maxDiscount,
        usageLimit: coupon.usageLimit,
        expiresAt: coupon.expiresAt,
      },
      discount,
      finalAmount: round2(subtotal - discount),
      message: `Applied ${discount} off ${subtotal}`,
    }
  }

  async validate({ code, subtotal }: ValidateCouponRequest, userId?: string) {
    const result = await this.resolveCoupon(code, subtotal, { userId })
    const { couponId, ...rest } = result
    return rest
  }

  /**
   * Gives a redemption back when the order it was used for never completed
   * (customer cancelled or the payment window expired). Without this, an
   * abandoned checkout would burn the customer's single-use coupon.
   */
  async refundForOrder(orderId: string, tx?: Prisma.TransactionClient) {
    const db: Db = tx ?? this.prisma

    const usages = await db.couponUsage.findMany({
      where: { orderId },
      select: { id: true, couponId: true },
    })
    if (usages.length === 0) return { refunded: 0 }

    await db.couponUsage.deleteMany({ where: { orderId } })

    for (const usage of usages) {
      // Guard against a negative counter if data ever drifts.
      await db.$queryRaw`
        UPDATE "coupons" SET "usedCount" = "usedCount" - 1
        WHERE "id" = ${usage.couponId} AND "usedCount" > 0
      `
    }

    return { refunded: usages.length }
  }

  /**
   * Record a coupon redemption. The usage counter is incremented with a
   * conditional update so two concurrent checkouts cannot exceed usageLimit.
   */
  async consume(
    couponId: string,
    userId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db: Db = tx ?? this.prisma

    const rows = await db.$queryRaw<{ usedCount: number; usageLimit: number | null }[]>`
      UPDATE "coupons"
      SET "usedCount" = "usedCount" + 1
      WHERE "id" = ${couponId}
        AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
      RETURNING "usedCount", "usageLimit"
    `

    if (rows.length === 0) {
      throw new BadRequestException('Coupon usage limit reached')
    }

    try {
      await db.couponUsage.create({ data: { couponId, userId, orderId } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('You have already used this coupon')
      }
      throw error
    }

    return rows[0].usedCount
  }
}
