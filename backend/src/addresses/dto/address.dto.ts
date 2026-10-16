import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateAddressDto {
  @ApiProperty({ example: 'Budi Santoso', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipient!: string

  @ApiProperty({ example: '081234567890', minLength: 6, maxLength: 30 })
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone!: string

  @ApiProperty({
    example: 'Jl. Merdeka No. 10, RT 01 / RW 02',
    minLength: 3,
    maxLength: 200,
    description: 'Street address line 1',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1!: string

  @ApiPropertyOptional({ example: 'Kel. Menteng', maxLength: 200, description: 'Street address line 2' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string

  @ApiProperty({ example: 'Jakarta Pusat', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string

  @ApiPropertyOptional({ example: 'DKI Jakarta', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string

  @ApiPropertyOptional({ example: '10110', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @ApiPropertyOptional({ example: 'ID', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string

  @ApiPropertyOptional({ example: 'Rumah', maxLength: 40, description: 'Short label like "Rumah" or "Kantor"' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string

  @ApiPropertyOptional({
    example: true,
    description: 'Make this the default shipping address',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}

/** Partial update: only the fields sent are changed. */
export class UpdateAddressDto {
  @ApiPropertyOptional({ example: 'Budi Santoso', minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipient?: string

  @ApiPropertyOptional({ example: '081234567890', minLength: 6, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone?: string

  @ApiPropertyOptional({ example: 'Jl. Merdeka No. 10', minLength: 3, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1?: string

  @ApiPropertyOptional({ example: 'Kel. Menteng', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string

  @ApiPropertyOptional({ example: 'Jakarta Pusat', minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string

  @ApiPropertyOptional({ example: 'DKI Jakarta', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string

  @ApiPropertyOptional({ example: '10110', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @ApiPropertyOptional({ example: 'ID', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string

  @ApiPropertyOptional({ example: 'Rumah', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}
