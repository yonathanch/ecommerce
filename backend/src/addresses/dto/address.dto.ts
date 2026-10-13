import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator'

export class CreateAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipient!: string

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone!: string

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  recipient?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}
