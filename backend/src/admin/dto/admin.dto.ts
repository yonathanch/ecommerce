import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsBooleanString,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { OrderStatus } from '@prisma/client'

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]

export class ListAdminOrdersDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus

  /** Matches order id, customer email or customer name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus

  /** Optional audit note, stored on the stock ledger row for a refund. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string
}

export class AdminInventoryQueryDto {
  @IsOptional()
  @IsBooleanString()
  lowOnly?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string
}

export class ListCustomersDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class AdminCategoriesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string
}

export const COUPON_TYPES = ['PERCENT', 'FIXED'] as const
export type CouponType = (typeof COUPON_TYPES)[number]

export class ListCouponsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @IsOptional()
  @IsBooleanString()
  activeOnly?: string
}

/**
 * `null` is meaningful on the nullable fields: it clears them (no minimum, no
 * cap, unlimited redemptions, never expires). Omitting the key leaves the stored
 * value alone, which is what makes this usable as a partial update.
 */
export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string

  @IsIn(COUPON_TYPES)
  type!: CouponType

  @IsNumber()
  @Min(1)
  value!: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchase?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code?: string

  @IsOptional()
  @IsIn(COUPON_TYPES)
  type?: CouponType

  @IsOptional()
  @IsNumber()
  @Min(1)
  value?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchase?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null

  @IsOptional()
  @IsBoolean()
  active?: boolean
}

/** Same shape for create and rename — the slug is derived server-side. */
export class CategoryNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string
}
