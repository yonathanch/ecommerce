import { Type } from 'class-transformer'
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator'

export class CreateOrderItemDto {
  @IsString()
  productId: string

  @IsInt()
  @Min(1)
  quantity: number

  @IsOptional()
  @IsString()
  variantSku?: string
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[]
}
