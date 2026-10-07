import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
} from './dto/product.dto'

export type { CreateProductDto, UpdateProductDto }

/** Lowercase, dash-separated, unique-ish slug from a category name. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { position: 'asc' as const } },
  variants: true,
} satisfies Prisma.ProductInclude

type ProductWithDetails = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create a category by name. Categories are user-facing strings,
   * so product creation must not fail when a new category appears.
   */
  private async resolveCategory(name: string) {
    const slug = slugify(name)
    const existing = await this.prisma.category.findFirst({
      where: { OR: [{ name }, { slug }] },
    })
    if (existing) return existing
    return this.prisma.category.create({ data: { name, slug } })
  }

  /** Flatten relation shape to the plain `category: string` the frontend expects. */
  private present(product: ProductWithDetails) {
    return { ...product, category: product.category.name }
  }

  async findAll(query: ListProductsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const skip = (page - 1) * limit
    const sortBy = query.sortBy || 'createdAt'
    const sortOrder = query.sortOrder || 'desc'

    const where: Prisma.ProductWhereInput = {}
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ]
    }
    if (query.category) {
      where.category = { name: query.category }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.product.count({ where }),
    ])

    return {
      items: items.map((p) => this.present(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    })
    if (!product) throw new NotFoundException('Product not found')
    return this.present(product)
  }

  async create(dto: CreateProductDto) {
    const category = await this.resolveCategory(dto.category)

    try {
      return await this.prisma.product
        .create({
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          stock: dto.stock ?? 0,
          categoryId: category.id,
          images: dto.imageUrls?.length
            ? {
                create: dto.imageUrls.map((url, position) => ({
                  url,
                  position,
                })),
              }
            : undefined,
          variants: dto.variants?.length
            ? {
                create: dto.variants.map((v) => ({
                  sku: v.sku,
                  options: (v.options ?? {}) as Prisma.InputJsonValue,
                  price: v.price,
                  stock: v.stock ?? 0,
                  weight: v.weight,
                  imageUrl: v.imageUrl,
                })),
              }
            : undefined,
        },
        include: PRODUCT_INCLUDE,
      })
      .then((p) => this.present(p))
    } catch (error) {
      throw this.toKnownError(error)
    }
  }

  /** Translate Prisma known errors to safe HTTP errors; rethrow unknown ones. */
  private toKnownError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = (error.meta as { target?: string[] })?.target
        return new BadRequestException(
          target?.includes('sku')
            ? 'A variant with this SKU already exists'
            : 'A record with this value already exists',
        )
      }
    }
    return error instanceof Error ? error : new Error('Unknown error')
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Product not found')

    const category = dto.category
      ? await this.resolveCategory(dto.category)
      : undefined

    return this.prisma.product
      .update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          stock: dto.stock,
          categoryId: category?.id,
        },
        include: PRODUCT_INCLUDE,
      })
      .then((p) => this.present(p))
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Product not found')
    return this.prisma.product.delete({ where: { id } })
  }

  async getCategories() {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { name: true },
    })
    return rows.map((r) => r.name)
  }
}
