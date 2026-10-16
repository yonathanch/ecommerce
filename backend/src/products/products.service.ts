import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { InventoryService } from '../inventory/inventory.service'
import { ReviewsService } from '../reviews/reviews.service'
import { slugify } from '../common/slug'
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
  VariantInputDto,
} from './dto/product.dto'

export type { CreateProductDto, UpdateProductDto }

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { position: 'asc' as const } },
  variants: true,
} satisfies Prisma.ProductInclude

type ProductWithDetails = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly reviews: ReviewsService,
  ) {}

  /**
   * Resolve an existing category by name or slug, matched through the slug so
   * "sepatu pria" and "Sepatu Pria" land on the same row instead of creating a
   * near-duplicate.
   *
   * An unknown name is rejected rather than created on the fly: categories are
   * the chips the storefront renders, so implicitly creating one let a typo in
   * the product form appear in the storefront navigation. Categories are owned
   * by the back-office (see AdminService.createCategory).
   */
  private async resolveCategory(name: string) {
    const slug = slugify(name)
    const existing = await this.prisma.category.findFirst({
      where: { OR: [{ name }, { slug }] },
    })
    if (!existing) {
      throw new BadRequestException(
        `Unknown category "${name}". Create it in the Kategori menu first.`,
      )
    }
    return existing
  }

  /**
   * Resolve an optional fashion label, matched through the slug so "VERSE" and
   * "verse" hit the same row. Brands are the cards in "Top Fashion Brands" and
   * the pages at /brands/<slug>, so an unknown label is rejected instead of
   * being invented — a typo would otherwise publish an empty brand page.
   *
   * `undefined` means "leave the label alone", `null`/blank clears it.
   */
  private async resolveBrand(value?: string | null) {
    const raw = value?.trim()
    if (!raw) return null

    const existing = await this.prisma.brand.findFirst({
      where: { OR: [{ name: raw }, { slug: slugify(raw) }] },
    })
    if (!existing) {
      throw new BadRequestException(`Unknown brand "${raw}".`)
    }
    return existing
  }

  /**
   * Flatten relation shape to the plain `category: string` the frontend expects
   * and expose the numbers the UI actually needs:
   * - `stock` is the physical quantity on the shelf,
   * - `reserved` is held by unpaid orders,
   * - `available` is what a shopper may still buy.
   */
  private present(product: ProductWithDetails, reserved = 0) {
    const held = Math.min(reserved, product.stock)
    return {
      ...product,
      category: product.category.name,
      reserved: held,
      available: Math.max(product.stock - held, 0),
    }
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
    if (query.brand) {
      where.brand = { slug: query.brand }
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

    const reserved = await this.inventory.reservedMap(items.map((p) => p.id))

    return {
      items: items.map((p) => this.present(p, reserved.get(p.id) ?? 0)),
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

    const [reserved, variantReserved, rating] = await Promise.all([
      this.inventory.reservedQuantity(id),
      // Per-SKU holds, so a size that is fully reserved reads "sold out" even
      // though the product as a whole still has units on the shelf.
      this.inventory.reservedVariantMap([id]),
      // The header's stars come from published reviews only, so a product
      // whose reviews are all still in moderation honestly reads "no rating".
      this.reviews.ratingSummary(id),
    ])

    const variants = product.variants.map((variant) => {
      const held = Math.min(variantReserved.get(`${id}::${variant.sku}`) ?? 0, variant.stock)
      return { ...variant, reserved: held, available: Math.max(variant.stock - held, 0) }
    })

    return { ...this.present({ ...product, variants }, reserved), rating }
  }

  async create(dto: CreateProductDto) {
    const category = await this.resolveCategory(dto.category)
    const brand = await this.resolveBrand(dto.brand)

    try {
      return await this.prisma.product
        .create({
        data: {
          name: dto.name,
          description: dto.description,
          price: dto.price,
          // A variant product's stock is the sum of its SKUs, so the submitted
          // product-level number is only honoured for variant-less products.
          stock: dto.variants?.length
            ? dto.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0)
            : dto.stock ?? 0,
          categoryId: category.id,
          brandId: brand?.id ?? null,
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
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { sku: true } } },
    })
    if (!existing) throw new NotFoundException('Product not found')

    const category = dto.category
      ? await this.resolveCategory(dto.category)
      : undefined
    const brand = dto.brand === undefined ? undefined : await this.resolveBrand(dto.brand)

    // Images and variants are replaced as a set, so they have to land together
    // with the product row rather than leaving a half-edited catalog behind.
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.imageUrls) {
          await tx.productImage.deleteMany({ where: { productId: id } })
          if (dto.imageUrls.length > 0) {
            await tx.productImage.createMany({
              data: dto.imageUrls.map((url, position) => ({ productId: id, url, position })),
            })
          }
        }

        if (dto.variants) {
          await this.syncVariants(tx, id, existing.variants.map((v) => v.sku), dto.variants)
        }

        // Once the variant set is settled, a variant product's stock is the sum
        // of its SKUs — the derived total always wins over the submitted number,
        // which is only meaningful for a product with no variants at all.
        const variantCount = await tx.productVariant.count({ where: { productId: id } })
        const derivedStock =
          variantCount > 0
            ? (
                await tx.productVariant.aggregate({
                  where: { productId: id },
                  _sum: { stock: true },
                })
              )._sum.stock ?? 0
            : dto.stock

        const updated = await tx.product.update({
          where: { id },
          data: {
            name: dto.name,
            description: dto.description,
            price: dto.price,
            stock: derivedStock,
            categoryId: category?.id,
            brandId: brand === undefined ? undefined : (brand?.id ?? null),
          },
          include: PRODUCT_INCLUDE,
        })
        return this.present(updated)
      })
    } catch (error) {
      throw this.toKnownError(error)
    }
  }

  /**
   * Bring a product's variant set in line with the submitted list, matched by
   * SKU.
   *
   * Stock is deliberately left untouched for SKUs that already exist: the
   * inventory ledger is the only writer that may move stock, and it demands an
   * admin reason (see the Inventori screen). For a brand-new SKU the submitted
   * `stock` is simply its opening balance, same as on create.
   *
   * Removing a SKU deletes its row without losing history — stock movements
   * store the SKU as text, not as a foreign key.
   */
  private async syncVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    currentSkus: string[],
    submitted: VariantInputDto[],
  ) {
    const seen = new Set<string>()
    for (const variant of submitted) {
      const sku = variant.sku.trim()
      if (seen.has(sku)) {
        throw new BadRequestException(`Duplicate SKU "${sku}" in the variant list`)
      }
      seen.add(sku)
    }

    const removed = currentSkus.filter((sku) => !seen.has(sku))
    if (removed.length > 0) {
      await tx.productVariant.deleteMany({ where: { productId, sku: { in: removed } } })
    }

    for (const variant of submitted) {
      const sku = variant.sku.trim()
      const editable = {
        options: (variant.options ?? {}) as Prisma.InputJsonValue,
        price: variant.price ?? null,
        weight: variant.weight ?? null,
        imageUrl: variant.imageUrl ?? null,
      }
      if (currentSkus.includes(sku)) {
        await tx.productVariant.update({ where: { sku }, data: editable })
      } else {
        await tx.productVariant.create({
          data: { ...editable, productId, sku, stock: variant.stock ?? 0 },
        })
      }
    }
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

  /** Fashion labels with their product counts, for the Top Fashion Brands section. */
  async getBrands() {
    const rows = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      productCount: b._count.products,
    }))
  }

  /**
   * Best sellers: products ranked by units actually sold.
   *
   * Only orders that represent real revenue (PAID / SHIPPED / DELIVERED) count
   * — unpaid, cancelled and refunded orders never move a product up this list.
   * Products deleted since the sale are skipped instead of failing the query.
   */
  async getBestSellers(limit = 8) {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      where: { order: { status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } } },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    })
    if (grouped.length === 0) return []

    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      include: PRODUCT_INCLUDE,
    })
    const byId = new Map(products.map((p) => [p.id, p]))
    const reserved = await this.inventory.reservedMap(products.map((p) => p.id))

    return grouped.flatMap((g) => {
      const product = byId.get(g.productId)
      if (!product) return []
      return [
        {
          ...this.present(product, reserved.get(product.id) ?? 0),
          sold: g._sum.quantity ?? 0,
        },
      ]
    })
  }
}
