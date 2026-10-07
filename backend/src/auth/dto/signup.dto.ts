import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator'

export class SignupDto {
  @IsEmail()
  email: string

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string
}
