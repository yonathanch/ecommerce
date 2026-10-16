import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MinLength } from 'class-validator'

export class CheckoutDto {
  @ApiProperty({
    example: 'clx9k2z8a0000qz8h1t7v2m3a',
    description: 'One of the customer\'s saved addresses to ship to',
  })
  @IsString()
  @MinLength(1)
  addressId!: string

  @ApiPropertyOptional({
    example: 'SUMMER20',
    description: 'Optional discount code; validated against the coupon rules',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  couponCode?: string
}
