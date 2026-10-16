import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ReviewsService } from './reviews.service'
import { CreateReviewDto } from './dto/create-review.dto'

/**
 * Product reviews, two doors:
 *
 * - `GET /reviews/product/:productId` is public and returns only PUBLISHED
 *   rows — this is what the storefront product page renders.
 * - The signed-in routes are for the buyer: `state` says whether they may
 *   review (and shows their own row of any status), `create` submits one, and
 *   `mine` lists their reviews across products.
 *
 * Moderation lives behind the ADMIN-guarded /admin routes (see AdminController).
 */
@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('product/:productId')
  list(@Param('productId') productId: string) {
    return this.reviewsService.listPublished(productId)
  }

  @Get('product/:productId/state')
  @UseGuards(JwtAuthGuard)
  state(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
  ) {
    return this.reviewsService.state(req.user.id, productId)
  }

  @Post('product/:productId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req: { user: { id: string } },
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(req.user.id, productId, dto)
  }

  /** Every review this customer wrote, of any status, newest first. */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@Request() req: { user: { id: string } }) {
    return this.reviewsService.mine(req.user.id)
  }
}
