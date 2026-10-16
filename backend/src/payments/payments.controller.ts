import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PaymentsService } from './payments.service'
import { CreatePaymentDto } from './dto/create-payment.dto'

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Creates a payment attempt for the caller's own PENDING order. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: { user: { id: string } }, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(req.user.id, dto.orderId)
  }

  @Get('order/:orderId')
  listForOrder(
    @Request() req: { user: { id: string } },
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.listForOrder(req.user.id, orderId)
  }

  /**
   * Sandbox only: acts as the gateway confirming/failing a payment. Disabled in
   * production and for real providers. Talks to the same code path a webhook
   * would, so signature verification and idempotency are exercised.
   */
  @Post('simulate/:providerRef/:outcome')
  @HttpCode(HttpStatus.OK)
  simulate(
    @Request() req: { user: { id: string } },
    @Param('providerRef') providerRef: string,
    @Param('outcome') outcome: 'captured' | 'failed' | 'expired',
  ) {
    return this.paymentsService.simulate(providerRef, outcome, req.user.id)
  }
}
