import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { InventoryModule } from '../inventory/inventory.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { CouponModule } from '../coupon/coupon.module'

@Module({
  imports: [InventoryModule, NotificationsModule, CouponModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
