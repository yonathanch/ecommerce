import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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
import { OrderStatus, ReviewStatus } from '@prisma/client'

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]

export class ListAdminOrdersDto {
  @ApiPropertyOptional({
    enum: ORDER_STATUSES,
    description: 'Only orders in this fulfilment state',
  })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus

  @ApiPropertyOptional({
    example: 'INV-2026-0001',
    description: 'Matches order id, customer email or customer name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: ORDER_STATUSES,
    description:
      'Target state. Transitions follow the fulfilment state machine: PENDING→CANCELLED, PAID→SHIPPED|REFUNDED, SHIPPED→DELIVERED|REFUNDED, DELIVERED→REFUNDED',
  })
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus

  @ApiPropertyOptional({
    example: 'Customer requested cancellation',
    maxLength: 200,
    description: 'Optional audit note, stored on the stock ledger row for a refund',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string

  @ApiPropertyOptional({
    example: 'JNE',
    maxLength: 60,
    description: 'Recorded on the transition to SHIPPED; correctable later',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  courier?: string

  @ApiPropertyOptional({
    example: 'JNE0012345678',
    maxLength: 80,
    description: 'Recorded on the transition to SHIPPED; correctable later',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  trackingNumber?: string
}

/** Correction of an existing shipment: this is what a mistyped resi needs. */
export class UpdateShipmentDto {
  @ApiPropertyOptional({ example: 'JNE', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  courier?: string

  @ApiPropertyOptional({ example: 'JNE0012345678', maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  trackingNumber?: string
}

export class ListShipmentsDto {
  @ApiPropertyOptional({
    example: 'JNE0012345678',
    description: 'Matches order id, tracking number, courier, customer email or name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({ enum: ['SHIPPED', 'DELIVERED'] })
  @IsOptional()
  @IsIn(['SHIPPED', 'DELIVERED'])
  status?: OrderStatus

  @ApiPropertyOptional({
    example: 'true',
    description: 'Boolean-as-string: only shipments still missing a tracking number',
  })
  @IsOptional()
  @IsBooleanString()
  missingTracking?: string

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class AdminInventoryQueryDto {
  @ApiPropertyOptional({
    example: 'true',
    description: 'Boolean-as-string: only products at or below the low-stock threshold',
  })
  @IsOptional()
  @IsBooleanString()
  lowOnly?: string

  @ApiPropertyOptional({ example: 'sepatu', description: 'Matches product name or SKU' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string
}

export class ListCustomersDto {
  @ApiPropertyOptional({ example: 'budi@example.com', description: 'Matches name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

export class AdminCategoriesQueryDto {
  @ApiPropertyOptional({ example: 'sepatu', description: 'Matches category name or slug' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string
}

/**
 * The command palette's one query. Deliberately not reusing the per-screen
 * DTOs: those carry their own filters (status, page), none of which the palette
 * has — it only ever asks "where does this text lead me?".
 */
export class AdminSearchQueryDto {
  @ApiProperty({
    example: 'sandal',
    description: 'Text matched against product names/SKUs, order ids/customers and customers',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  q!: string

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 10,
    description: 'Maximum rows returned per group',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number
}

export const COUPON_TYPES = ['PERCENT', 'FIXED'] as const
export type CouponType = (typeof COUPON_TYPES)[number]

export class ListCouponsDto {
  @ApiPropertyOptional({ example: 'SUMMER20', description: 'Matches the coupon code' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({
    example: 'true',
    description: 'Boolean-as-string: only currently-active coupons',
  })
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
  @ApiProperty({
    example: 'SUMMER20',
    minLength: 3,
    maxLength: 32,
    description: 'Codes are stored uppercase and matched case-insensitively',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code!: string

  @ApiProperty({ enum: COUPON_TYPES, description: 'PERCENT = % off, FIXED = flat amount off' })
  @IsIn(COUPON_TYPES)
  type!: CouponType

  @ApiProperty({
    example: 20,
    minimum: 1,
    description: 'PERCENT: 1–100. FIXED: discount amount in rupiah',
  })
  @IsNumber()
  @Min(1)
  value!: number

  @ApiPropertyOptional({
    example: 200000,
    minimum: 0,
    nullable: true,
    description: 'Cart subtotal must reach this before the code applies; null clears it',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchase?: number | null

  @ApiPropertyOptional({
    example: 100000,
    minimum: 0,
    nullable: true,
    description: 'Cap on a PERCENT discount; null clears it',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number | null

  @ApiPropertyOptional({
    example: 100,
    minimum: 1,
    nullable: true,
    description: 'Total redemptions allowed; null = unlimited',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    nullable: true,
    description: 'ISO 8601 expiry; null = never expires',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null

  @ApiPropertyOptional({ example: true, description: 'Disabled coupons stay stored but cannot be used' })
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

/** Partial update: omit a key to leave it alone, send `null` to clear it. */
export class UpdateCouponDto {
  @ApiPropertyOptional({ example: 'SUMMER25', minLength: 3, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  code?: string

  @ApiPropertyOptional({ enum: COUPON_TYPES })
  @IsOptional()
  @IsIn(COUPON_TYPES)
  type?: CouponType

  @ApiPropertyOptional({ example: 25, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  value?: number

  @ApiPropertyOptional({ example: 200000, minimum: 0, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPurchase?: number | null

  @ApiPropertyOptional({ example: 100000, minimum: 0, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number | null

  @ApiPropertyOptional({ example: 100, minimum: 1, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z', nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean
}

export const REVIEW_STATUSES: ReviewStatus[] = ['PENDING', 'PUBLISHED', 'REJECTED']

export class ListReviewsDto {
  @ApiPropertyOptional({ enum: REVIEW_STATUSES, description: 'Only reviews in this moderation state' })
  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  status?: ReviewStatus

  @ApiPropertyOptional({
    example: 'sepatu',
    description: 'Matches review body, title, reply, product name, author name or email',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}

/**
 * `status` and `reply` are both optional so the moderation screen can publish
 * without retyping the store's reply. `reply: null` clears a previous answer.
 */
export class UpdateReviewDto {
  @ApiPropertyOptional({
    enum: REVIEW_STATUSES,
    description: 'PUBLISH to show it on the storefront, REJECT to hide it',
  })
  @IsOptional()
  @IsIn(REVIEW_STATUSES)
  status?: ReviewStatus

  @ApiPropertyOptional({
    example: 'Terima kasih atas ulasannya!',
    maxLength: 1000,
    nullable: true,
    description: 'Public store reply shown under the review; null clears it',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reply?: string | null
}

/** Same shape for create and rename — the slug is derived server-side. */
export class CategoryNameDto {
  @ApiProperty({ example: 'Sepatu', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string
}

/** Identical contract to categories: only the name is authored, the slug follows. */
export class BrandNameDto extends CategoryNameDto {}
