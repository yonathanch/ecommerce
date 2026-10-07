import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateProductDto {
  name: string
  description?: string
  price: number
  stock?: number
  category?: string
}

export interface UpdateProductDto {
  name?: string
  description?: string
  price?: number
  stock?: number
  category?: string
}

export interface FindProductsQuery {
  search?: string
  category?: string
  page?: number
  limit?: number
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindProductsQuery) {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const skip = (page - 1) * limit

    const where: any = {}
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ]
    }
    if (query.category) {
      where.category = query.category
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ])

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  async create(dto: CreateProductDto) {
    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock ?? 0,
        category: dto.category ?? 'Uncategorized',
      },
    })
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id)
    return this.prisma.product.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.product.delete({ where: { id } })
  }

  async getCategories() {
    const rows = await this.prisma.product.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    })
    return rows.map((r) => r.category)
  }
}
