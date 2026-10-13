import { IsString, MinLength } from 'class-validator'

export class CreatePaymentDto {
  @IsString()
  @MinLength(1)
  orderId!: string
}
