import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'
import { AdminService } from './admin.service'
import { ReviewsService } from '../reviews/reviews.service'
import {
  AdminCategoriesQueryDto,
  AdminSearchQueryDto,
  BrandNameDto,
  AdminInventoryQueryDto,
  CategoryNameDto,
  CreateCouponDto,
  ListAdminOrdersDto,
  ListCouponsDto,
  ListCustomersDto,
  ListReviewsDto,
  ListShipmentsDto,
  UpdateCouponDto,
  UpdateOrderStatusDto,
  UpdateReviewDto,
  UpdateShipmentDto,
} from './dto/admin.dto'

/**
 * Back-office API. Every route is ADMIN-only, which is enforced once here
 * instead of per handler so a new endpoint cannot forget its guard.
 */
@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    // Moderation lives in the reviews domain; only its door is back here so
    // every ADMIN-only route stays visible in this one controller.
    private readonly reviewsService: ReviewsService,
  ) {}

  @Get('stats')
  stats() {
    return this.adminService.stats()
  }

  /**
   * Backs the header's Ctrl+K palette. Every other screen searches one domain;
   * this one answers "where does this text lead?" across the three things an
   * admin types — a product, an order id, a customer.
   */
  @Get('search')
  search(@Query() query: AdminSearchQueryDto) {
    return this.adminService.search({ q: query.q, limit: query.limit })
  }

  /** Everything the E-Commerce screen renders, from real paid orders. */
  @Get('analytics')
  analytics() {
    return this.adminService.analytics()
  }

  @Get('orders')
  listOrders(@Query() query: ListAdminOrdersDto) {
    return this.adminService.listOrders({
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.adminService.getOrder(id)
  }

  @Patch('orders/:id/status')
  updateStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(id, dto.status, req.user.id, {
      reason: dto.reason,
      courier: dto.courier,
      trackingNumber: dto.trackingNumber,
    })
  }

  @Get('shipments')
  shipments(@Query() query: ListShipmentsDto) {
    return this.adminService.listShipments({
      search: query.search,
      status: query.status,
      missingTracking: query.missingTracking === 'true',
      page: query.page,
      limit: query.limit,
    })
  }

  @Patch('orders/:id/shipment')
  updateShipment(@Param('id') id: string, @Body() dto: UpdateShipmentDto) {
    return this.adminService.updateShipment(id, dto)
  }

  @Get('inventory')
  inventory(@Query() query: AdminInventoryQueryDto) {
    return this.adminService.inventoryOverview({
      lowOnly: query.lowOnly === 'true',
      search: query.search,
    })
  }

  @Get('customers')
  customers(@Query() query: ListCustomersDto) {
    return this.adminService.listCustomers({
      search: query.search,
      page: query.page,
      limit: query.limit,
    })
  }

  @Get('customers/:id')
  customer(@Param('id') id: string) {
    return this.adminService.getCustomer(id)
  }

  /**
   * Categories are the chips the storefront renders, so they are managed here
   * rather than created implicitly by the product form.
   */
  @Get('categories')
  categories(@Query() query: AdminCategoriesQueryDto) {
    return this.adminService.listCategories({ search: query.search })
  }

  @Post('categories')
  createCategory(@Body() dto: CategoryNameDto) {
    return this.adminService.createCategory(dto.name)
  }

  @Patch('categories/:id')
  renameCategory(@Param('id') id: string, @Body() dto: CategoryNameDto) {
    return this.adminService.renameCategory(id, dto.name)
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id)
  }

  /**
   * Brands feed the storefront's brand cards and /brands/<slug> pages, so they
   * are owned here — the product form only picks from this list.
   */
  @Get('brands')
  brands(@Query() query: AdminCategoriesQueryDto) {
    return this.adminService.listBrands({ search: query.search })
  }

  @Post('brands')
  createBrand(@Body() dto: BrandNameDto) {
    return this.adminService.createBrand(dto.name)
  }

  @Patch('brands/:id')
  renameBrand(@Param('id') id: string, @Body() dto: BrandNameDto) {
    return this.adminService.renameBrand(id, dto.name)
  }

  @Delete('brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.adminService.deleteBrand(id)
  }

  /**
   * Coupons are what the storefront checkout validates against, so creating one
   * here is immediately spendable by a customer.
   */
  @Get('coupons')
  coupons(@Query() query: ListCouponsDto) {
    return this.adminService.listCoupons({
      search: query.search,
      activeOnly: query.activeOnly === 'true',
    })
  }

  @Post('coupons')
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.adminService.createCoupon(dto)
  }

  @Patch('coupons/:id')
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.adminService.updateCoupon(id, dto)
  }

  @Delete('coupons/:id')
  deleteCoupon(@Param('id') id: string) {
    return this.adminService.deleteCoupon(id)
  }

  /**
   * Reviews arrive as PENDING from the storefront; this queue is what makes
   * them public (or removes them entirely).
   */
  @Get('reviews')
  reviews(@Query() query: ListReviewsDto) {
    return this.reviewsService.listForAdmin({
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })
  }

  @Patch('reviews/:id')
  moderateReview(@Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.reviewsService.moderate(id, dto)
  }

  @Delete('reviews/:id')
  deleteReview(@Param('id') id: string) {
    return this.reviewsService.remove(id)
  }
}
