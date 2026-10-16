import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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
  @ApiProperty({ example: 'clx9k2z8a0000qz8h1t7v2m3a' })
  @IsString()
  @MinLength(1)
  productId!: string

  @ApiPropertyOptional({
    example: 'NIKE-AM-BLK-42',
    maxLength: 64,
    description: 'Optional variant-level correction; SKU must belong to productId',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  variantSku?: string

  @ApiProperty({
    example: -3,
    description: 'Signed quantity: positive to add stock, negative to remove',
  })
  @IsInt()
  delta!: number

  @ApiProperty({
    example: 'Damaged in transit — written off',
    minLength: 3,
    maxLength: 200,
    description: 'Why the stock moved; stored on the ledger row',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string
}

export class LowStockQueryDto {
  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    maximum: 1000,
    description: 'Override the LOW_STOCK_THRESHOLD for this call',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  threshold?: number
}

export class InventoryHistoryQueryDto {
  @ApiPropertyOptional({ example: 'clx9k2z8a0000qz8h1t7v2m3a' })
  @IsOptional()
  @IsString()
  productId?: string

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number
}
