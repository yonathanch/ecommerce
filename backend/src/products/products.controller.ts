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
import { ProductsService, CreateProductDto, UpdateProductDto, FindProductsQuery } from './products.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@Query() query: FindProductsQuery) {
    return this.productsService.findAll(query)
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories()
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto)
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id)
  }
}
