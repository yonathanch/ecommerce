import { Module, Provider } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { InventoryModule } from '../inventory/inventory.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentsController } from './payments.controller'
import { PaymentsWebhookController } from './payments-webhook.controller'
import { PaymentsService } from './payments.service'
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface'
import { MockPaymentProvider } from './providers/mock.provider'
import { MidtransProvider } from './providers/midtrans.provider'

/**
 * Provider wiring for the active gateway.
 *
 * Unsupported values fail at boot on purpose: a half-configured production
 * deployment must not silently fall back to the sandbox provider. Adding a real
 * gateway means implementing `PaymentProvider` and registering it here.
 */
const paymentProviderFactory: Provider = {
  provide: PAYMENT_PROVIDER,
  useFactory: (): PaymentProvider => {
    const configured = (process.env.PAYMENT_PROVIDER ?? 'mock').toLowerCase()

    if (configured === 'mock') return new MockPaymentProvider()
    if (configured === 'midtrans') return new MidtransProvider()

    throw new Error(
      `PAYMENT_PROVIDER="${configured}" is not implemented. Implement PaymentProvider for this gateway and register it in PaymentsModule.`,
    )
  },
}

@Module({
  imports: [PrismaModule, InventoryModule, NotificationsModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [paymentProviderFactory, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
