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

  /**
   * Fashion label, matched by name or slug against the Brands table. Optional —
   * a product without a label stays valid and simply has no brand page.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null

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

/**
 * One purchasable combination (e.g. NIKE-AM-BLK-42). Shared by the create and
 * update payloads so both accept the same editable fields.
 */
export class VariantInputDto {
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

export class CreateVariantDto extends VariantInputDto {}

/**
 * Update payload. Same shape as the create variant on purpose: the product form
 * submits the whole variant list as the desired end state, so every entry has to
 * be able to change every editable field. `stock` is only applied to SKUs that
 * do not exist yet — see ProductsService.syncVariants.
 */
export class UpdateVariantDto extends VariantInputDto {}

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

  /** `null` clears the label; an unknown name or slug is rejected. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null

  /**
   * The whole gallery, in order. When present the submitted list replaces the
   * stored images, so an empty array clears them.
   */
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[]

  /**
   * Full variant set, matched by SKU. Missing SKUs are removed and new ones are
   * created; `stock` is only honoured for those new SKUs, because moving the
   * stock of an existing SKU has to leave a trace in the inventory ledger.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[]
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

  /** Brand slug (e.g. "verse") — filters the catalog to one fashion label. */
  @IsOptional()
  @IsString()
  brand?: string

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
