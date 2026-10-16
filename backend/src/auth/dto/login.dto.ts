import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'Account email address' })
  @IsEmail()
  email: string

  @ApiProperty({ example: '••••••••', description: 'Account password (min 1 character)' })
  @IsString()
  @MinLength(1)
  password: string
}
