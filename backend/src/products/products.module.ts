import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { PrismaModule } from '../prisma/prisma.module'
import { InventoryModule } from '../inventory/inventory.module'
import { ReviewsModule } from '../reviews/reviews.module'

@Module({
  imports: [PrismaModule, InventoryModule, ReviewsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
