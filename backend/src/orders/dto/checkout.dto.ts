import { IsOptional, IsString, MinLength } from 'class-validator'

export class CheckoutDto {
  @IsString()
  @MinLength(1)
  addressId!: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  couponCode?: string
}
