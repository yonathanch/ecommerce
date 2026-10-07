import { Type } from 'class-transformer'
import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsInt,
  IsIn,
  IsArray,
  ValidateNested,
  IsUrl,
  IsObject,
} from 'class-validator'

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @IsNumber()
  @Min(0)
  price: number

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category: string

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[]
}

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku: string

  @IsOptional()
  @IsObject()
  options?: Record<string, string>

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number

  @IsOptional()
  @IsUrl()
  imageUrl?: string
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string
}

export const SORTABLE_FIELDS = ['name', 'price', 'createdAt'] as const
export type SortableField = (typeof SORTABLE_FIELDS)[number]

export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsIn([...SORTABLE_FIELDS])
  sortBy?: SortableField

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'

  // Query params arrive as strings; @Type converts them before validation.
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
