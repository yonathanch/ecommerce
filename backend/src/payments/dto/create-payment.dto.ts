import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class CreatePaymentDto {
  @ApiProperty({
    example: 'clx9k2z8a0000qz8h1t7v2m3a',
    description: 'The PENDING order to open a payment for',
  })
  @IsString()
  @MinLength(1)
  orderId!: string
}
