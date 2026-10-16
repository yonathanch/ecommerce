import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CouponService, ValidateCouponRequest } from './coupon.service'

@ApiTags('coupons')
@Controller('coupons')
@UseGuards(JwtAuthGuard)
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Request() req: { user: { id: string } },
    @Body() body: ValidateCouponRequest,
  ) {
    return this.couponService.validate(
      { code: body.code, subtotal: body.subtotal },
      req.user.id,
    )
  }
}
