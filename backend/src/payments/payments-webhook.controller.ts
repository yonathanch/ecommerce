import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common'
import { Request } from 'express'
import { PaymentsService } from './payments.service'

/**
 * Gateway callback endpoint. Deliberately public (no JwtAuthGuard): the gateway
 * authenticates with an HMAC signature over the raw body, not with our bearer
 * token. The raw body is required for that verification, so Nest is started
 * with `rawBody: true`.
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payment-signature') signature?: string,
  ) {
    return this.paymentsService.handleWebhook({
      rawBody: req.rawBody ?? Buffer.from(''),
      signature,
    })
  }
}
