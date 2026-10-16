import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator'

/**
 * A review is one to five stars plus text. The bounds live here because the
 * average shown on the storefront is only meaningful inside that range.
 */
export class CreateReviewDto {
  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 5,
    description: 'Star rating, 1 (worst) to 5 (best)',
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number

  @ApiProperty({
    example: 'Comfortable for daily wear',
    maxLength: 120,
    required: false,
    description: 'Optional short headline',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string

  @ApiProperty({
    example: 'Bahan adem, jahitan rapi, dan ukurannya pas. Recommended!',
    minLength: 5,
    maxLength: 2000,
    description: 'The review text itself, 5–2000 characters',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  body!: string
}
