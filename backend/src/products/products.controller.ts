import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ProductsService } from './products.service'
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto/product.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard, Roles } from '../auth/roles.guard'
import { Role } from '@prisma/client'

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query)
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories()
  }

  // Declared before ':id' so "brands" is not swallowed as a product id.
  @Get('brands')
  async getBrands() {
    return this.productsService.getBrands()
  }

  // Declared before ':id' so "best-sellers" is not swallowed as a product id.
  @Get('best-sellers')
  async getBestSellers(@Query('limit') limit?: string) {
    const parsed = Number(limit)
    const safe = Number.isFinite(parsed) ? Math.min(20, Math.max(1, parsed)) : 8
    return this.productsService.getBestSellers(safe)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id)
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto)
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id)
  }
}
