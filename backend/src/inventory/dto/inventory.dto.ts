import { Type } from 'class-transformer'
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class AdjustStockDto {
  @IsString()
  @MinLength(1)
  productId!: string

  /** Optional variant-level correction; SKU must belong to `productId`. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  variantSku?: string

  /** Signed quantity: positive to add stock, negative to remove. */
  @IsInt()
  delta!: number

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string
}

export class LowStockQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  threshold?: number
}

export class InventoryHistoryQueryDto {
  @IsOptional()
  @IsString()
  productId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number
}
