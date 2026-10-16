import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator'

export class SignupDto {
  @ApiProperty({ example: 'user@example.com', description: 'Account email address' })
  @IsEmail()
  email: string

  @ApiProperty({
    example: '••••••••',
    minLength: 8,
    maxLength: 72,
    description: 'Password, 8–72 characters',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password: string

  @ApiProperty({
    example: 'Budi Santoso',
    minLength: 1,
    maxLength: 100,
    description: 'Display name shown on orders and reviews',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string
}
