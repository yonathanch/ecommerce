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
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'
import { AdminService } from './admin.service'
import {
  AdminCategoriesQueryDto,
  AdminInventoryQueryDto,
  CategoryNameDto,
  CreateCouponDto,
  ListAdminOrdersDto,
  ListCouponsDto,
  ListCustomersDto,
  UpdateCouponDto,
  UpdateOrderStatusDto,
} from './dto/admin.dto'

/**
 * Back-office API. Every route is ADMIN-only, which is enforced once here
 * instead of per handler so a new endpoint cannot forget its guard.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  stats() {
    return this.adminService.stats()
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
    return this.adminService.updateOrderStatus(id, dto.status, req.user.id, dto.reason)
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
}
