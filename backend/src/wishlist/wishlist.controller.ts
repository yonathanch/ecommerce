import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { WishlistService } from './wishlist.service'

@ApiTags('wishlist')
@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  getWishlist(@Request() req: { user: { id: string } }) {
    return this.wishlistService.getWishlist(req.user.id)
  }

  @Post('items/:productId')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.addItem(req.user.id, productId)
  }

  @Delete('items/:productId')
  async removeItem(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.removeItem(req.user.id, productId)
  }

  @Post('items/:productId/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleItem(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.wishlistService.toggleItem(req.user.id, productId)
  }
}
