import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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
  @ApiProperty({ example: 'Sepatu Sekolah Anak', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string

  @ApiPropertyOptional({
    example: 'Sepatu sekolah nyaman dengan sol karet anti-slip.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @ApiProperty({ example: 199000, minimum: 0, description: 'Base price in rupiah' })
  @IsNumber()
  @Min(0)
  price: number

  @ApiPropertyOptional({
    example: 24,
    minimum: 0,
    description:
      'Opening stock; ignored once variants are present (variant stock is summed instead)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @ApiProperty({ example: 'sepatu', minLength: 1, maxLength: 100, description: 'Category name or slug' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category: string

  @ApiPropertyOptional({
    example: 'nike',
    maxLength: 100,
    nullable: true,
    description:
      'Fashion label, matched by name or slug against the Brands table. Optional — a product without a label stays valid and simply has no brand page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null

  @ApiPropertyOptional({
    type: [String],
    example: ['https://picsum.photos/seed/1/800/800'],
    description: 'Ordered gallery image URLs',
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[]

  // Lazy () => Class form: the variant classes are declared below, and the
  // swagger metadata is evaluated at decoration time, before they exist.
  @ApiPropertyOptional({
    type: () => CreateVariantDto,
    isArray: true,
    description: 'Purchasable variants (size/colour combinations)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[]
}

/**
 * One purchasable combination (e.g. NIKE-AM-BLK-42). Shared by the create and
 * update payloads so both accept the same editable fields.
 */
export class VariantInputDto {
  @ApiProperty({
    example: 'NIKE-AM-BLK-42',
    minLength: 1,
    maxLength: 64,
    description: 'Unique stock-keeping code',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku: string

  @ApiPropertyOptional({
    example: { colour: 'Black', size: '42' },
    description: 'Free-form option map shown on the storefront',
  })
  @IsOptional()
  @IsObject()
  options?: Record<string, string>

  @ApiPropertyOptional({ example: 209000, minimum: 0, description: 'Price for this variant' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @ApiPropertyOptional({
    example: 4,
    minimum: 0,
    description: 'Opening stock; only honoured for newly created SKUs',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @ApiPropertyOptional({ example: 0.8, minimum: 0, description: 'Shipping weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number

  @ApiPropertyOptional({ example: 'https://picsum.photos/seed/v1/800/800' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string
}

export class CreateVariantDto extends VariantInputDto {}

/**
 * Update payload. Same shape as the create variant on purpose: the product form
 * submits the whole variant list as the desired end state, so every entry has to
 * be able to change every editable field. `stock` is only applied to SKUs that
 * do not exist yet — see ProductsService.syncVariants.
 */
export class UpdateVariantDto extends VariantInputDto {}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Sepatu Sekolah Anak Pro', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string

  @ApiPropertyOptional({ example: 'Sepatu sekolah nyaman dengan sol karet anti-slip.', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @ApiPropertyOptional({ example: 209000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number

  @ApiPropertyOptional({
    example: 30,
    minimum: 0,
    description:
      'Product-level stock; variant stock is summed instead when variants exist',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number

  @ApiPropertyOptional({ example: 'sepatu', minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  category?: string

  @ApiPropertyOptional({
    example: 'nike',
    maxLength: 100,
    nullable: true,
    description: '`null` clears the label; an unknown name or slug is rejected',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null

  @ApiPropertyOptional({
    type: [String],
    example: ['https://picsum.photos/seed/1/800/800'],
    description:
      'The whole gallery, in order. When present the submitted list replaces the stored images, so an empty array clears them.',
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[]

  @ApiPropertyOptional({
    type: () => UpdateVariantDto,
    isArray: true,
    description:
      'Full variant set, matched by SKU. Missing SKUs are removed and new ones are created; `stock` is only honoured for those new SKUs, because moving the stock of an existing SKU has to leave a trace in the inventory ledger.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[]
}

export const SORTABLE_FIELDS = ['name', 'price', 'createdAt'] as const
export type SortableField = (typeof SORTABLE_FIELDS)[number]

export class ListProductsQueryDto {
  @ApiPropertyOptional({ example: 'sepatu', description: 'Substring match on the product name' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ example: 'sepatu', description: 'Category slug to filter by' })
  @IsOptional()
  @IsString()
  category?: string

  @ApiPropertyOptional({
    example: 'verse',
    description: 'Brand slug (e.g. "verse") — filters the catalog to one fashion label',
  })
  @IsOptional()
  @IsString()
  brand?: string

  @ApiPropertyOptional({ enum: SORTABLE_FIELDS, description: 'Field to sort on' })
  @IsOptional()
  @IsIn([...SORTABLE_FIELDS])
  sortBy?: SortableField

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: 'Sort direction' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc'

  // Query params arrive as strings; @Type converts them before validation.
  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 12, minimum: 1, maximum: 100, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number
}
