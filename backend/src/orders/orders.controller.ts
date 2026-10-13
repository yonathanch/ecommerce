import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { OrdersService } from './orders.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { CheckoutDto } from './dto/checkout.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Preferred entry point: turns the server-side cart into an order.
   * Payment status is never set from here — only a verified webhook does that.
   */
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async checkout(@Request() req: { user: { id: string } }, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(req.user.id, dto)
  }

  /** Direct order creation from an item list (kept for admin/manual flows). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: { user: { id: string } }, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, dto)
  }

  /** Stock ledger for the caller's own orders. */
  @Get('inventory')
  async inventory(
    @Request() req: { user: { id: string } },
    @Query('productId') productId?: string,
  ) {
    return this.ordersService.inventoryHistory(req.user.id, productId)
  }

  /**
   * Releases holds on orders whose payment window elapsed. Admin only; M9 will
   * run the same logic on a BullMQ schedule.
   */
  @Roles('ADMIN')
  @Post('maintenance/expire')
  @HttpCode(HttpStatus.OK)
  async expireStale() {
    return this.ordersService.expireStaleOrders()
  }

  @Get()
  async findAll(@Request() req: { user: { id: string } }) {
    return this.ordersService.findAll(req.user.id)
  }

  @Get(':id')
  async findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.ordersService.findOne(req.user.id, id)
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.ordersService.cancel(req.user.id, id)
  }
}
