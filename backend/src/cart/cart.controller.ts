import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Put,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CartService, CartItemDto } from './cart.service'

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Request() req: { user: { id: string } }) {
    return this.cartService.getCart(req.user.id)
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Request() req: { user: { id: string } },
    @Body() body: CartItemDto,
  ) {
    return this.cartService.addItem(req.user.id, body)
  }

  @Put('items/:productId')
  async updateQuantity(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
    @Body() body: { quantity: number },
  ) {
    return this.cartService.updateQuantity(req.user.id, productId, body.quantity)
  }

  @Delete('items/:productId')
  async removeItem(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.cartService.removeItem(req.user.id, productId)
  }

  @Post('clear')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@Request() req: { user: { id: string } }) {
    await this.cartService.clearCart(req.user.id)
  }
}
