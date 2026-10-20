import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { ProductsModule } from './products/products.module'
import { OrdersModule } from './orders/orders.module'
import { CartModule } from './cart/cart.module'
import { WishlistModule } from './wishlist/wishlist.module'
import { CouponModule } from './coupon/coupon.module'
import { AddressesModule } from './addresses/addresses.module'
import { InventoryModule } from './inventory/inventory.module'
import { PaymentsModule } from './payments/payments.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ReviewsModule } from './reviews/reviews.module'
import { AdminModule } from './admin/admin.module'
import { UploadsModule } from './uploads/uploads.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Global rate limit, keyed per route per client IP. Defaults are generous
    // on purpose: they stop floods without slowing a real shopper. The auth
    // controller tightens this to a much stricter limit on its own routes.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000),
          limit: Number(process.env.RATE_LIMIT_MAX ?? 300),
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    ProductsModule,
    OrdersModule,
    CartModule,
    WishlistModule,
    CouponModule,
    AddressesModule,
    InventoryModule,
    PaymentsModule,
    NotificationsModule,
    ReviewsModule,
    AdminModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Single place that maps any thrown error to a safe HTTP response.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Apply the ThrottlerModule rate limit to every route by default, using
    // the custom guard so a 429 uses the same error envelope as the rest of
    // the API.
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AppModule {}
