import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'
import { InventoryService } from './inventory.service'
import {
  AdjustStockDto,
  InventoryHistoryQueryDto,
  LowStockQueryDto,
} from './dto/inventory.dto'

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /** Any signed-in user may ask how many units are actually buyable. */
  @Get('availability/:productId')
  availability(@Param('productId') productId: string) {
    return this.inventoryService.availability(productId)
  }

  @Roles('ADMIN')
  @Get('low-stock')
  lowStock(@Query() query: LowStockQueryDto) {
    return this.inventoryService.lowStock(query.threshold)
  }

  @Roles('ADMIN')
  @Get('history')
  history(@Query() query: InventoryHistoryQueryDto) {
    return this.inventoryService.history({
      productId: query.productId,
      take: query.take,
    })
  }

  @Roles('ADMIN')
  @Post('adjust')
  @HttpCode(HttpStatus.OK)
  adjust(@Request() req: { user: { id: string } }, @Body() dto: AdjustStockDto) {
    return this.inventoryService.adjust({
      productId: dto.productId,
      variantSku: dto.variantSku,
      delta: dto.delta,
      reason: dto.reason,
      userId: req.user.id,
    })
  }

}
