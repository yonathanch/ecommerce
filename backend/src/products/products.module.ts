import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { PrismaModule } from '../prisma/prisma.module'
import { InventoryModule } from '../inventory/inventory.module'

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
