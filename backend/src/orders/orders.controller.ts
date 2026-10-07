import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common'
import { OrdersService } from './orders.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, dto)
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.ordersService.findAll(req.user.id)
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.findOne(req.user.id, id)
  }

  @Post(':id/pay')
  async markAsPaid(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.markAsPaid(req.user.id, id)
  }

  @Post(':id/cancel')
  async cancel(@Request() req: any, @Param('id') id: string) {
    return this.ordersService.cancel(req.user.id, id)
  }
}
