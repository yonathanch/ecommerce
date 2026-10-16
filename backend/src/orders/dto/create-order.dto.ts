import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class CreateOrderItemDto {
  @ApiProperty({ example: 'clx9k2z8a0000qz8h1t7v2m3a', description: 'Product being ordered' })
  @IsString()
  productId: string

  @ApiProperty({ example: 2, minimum: 1, description: 'How many units of this product' })
  @IsInt()
  @Min(1)
  quantity: number

  @ApiPropertyOptional({
    example: 'NIKE-AM-BLK-42',
    description: 'Variant SKU; omit to order the base product',
  })
  @IsOptional()
  @IsString()
  variantSku?: string
}

export class CreateOrderDto {
  @ApiProperty({
    type: [CreateOrderItemDto],
    description: 'Lines to order; stock is checked for each one',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[]
}
