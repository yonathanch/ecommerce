import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { InventoryService } from '../inventory/inventory.service'

export interface CartItemDto {
  productId: string
  quantity: number
  /**
   * If the product has variants, the chosen variant's SKU. A cart line for a
   * variant product must name one — that SKU's stock and price are what the
   * line holds and charges.
   */
  variantSku?: string
}

/** The variant a cart line points at, for display and pricing. */
export interface CartVariant {
  sku: string
  options: Record<string, string>
  price: number | null
  stock: number
  imageUrl: string | null
}

export interface CartSummary {
  cart: Array<{
    id: string
    productId: string
    variantSku: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    /** Available units for this exact line (variant when named, else product). */
    stock: number
    variant: CartVariant | null
    product: {
      id: string
      name: string
      price: number
      stock: number
      images: { url: string; alt: string | null }[]
    } | null
  }>
  subtotal: number
  totalItems: number
}

const CART_ITEM_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      images: { select: { url: true, alt: true }, orderBy: { position: 'asc' } },
    },
  },
} as const

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Resolve the available units a cart line may draw from.
   *
   * A variant line judges against that SKU's stock minus its own holds; a base
   * line judges against the product's availability (stock minus all holds).
   * Either way the cart must use *available* units, not raw stock, otherwise
   * checkout would reject the item later.
   */
  private async getStock(
    productId: string,
    variantSku?: string,
  ): Promise<number> {
    if (variantSku) {
      const availability = await this.inventory.variantAvailability(
        productId,
        variantSku,
      )
      return availability.available
    }

    const { available } = await this.inventory.availability(productId)
    return available
  }

  /** Load the variants named on these cart rows, keyed by SKU. */
  private async loadVariants(skus: string[]) {
    if (skus.length === 0) return new Map<string, CartVariant>()
    const rows = await this.prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: {
        sku: true,
        options: true,
        price: true,
        stock: true,
        imageUrl: true,
      },
    })
    return new Map(
      rows.map((row) => [
        row.sku,
        {
          sku: row.sku,
          options: row.options as Record<string, string>,
          price: row.price,
          stock: row.stock,
          imageUrl: row.imageUrl,
        },
      ]),
    )
  }

  /**
   * Cart rows are keyed by Cart.id, not by User.id, so every mutation needs the
   * user's cart row to exist first.
   */
  private async getOrCreateCart(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new NotFoundException('User not found')

    return this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    })
  }

  async getCart(userId: string): Promise<CartSummary> {
    const cart = await this.getOrCreateCart(userId)
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: CART_ITEM_INCLUDE,
      orderBy: { id: 'asc' },
    })

    const variants = await this.loadVariants(
      [...new Set(items.map((i) => i.variantSku).filter((s) => s !== ''))],
    )

    const mapped = items.map((item) => {
      const variant = item.variantSku ? variants.get(item.variantSku) ?? null : null
      // A variant line prices at its own price (falling back to the base price);
      // a base line prices at the product price.
      const unitPrice = variant ? variant.price ?? item.product?.price ?? 0 : item.product?.price ?? 0
      const stock = variant ? variant.stock : item.product?.stock ?? 0
      return {
        id: item.id,
        productId: item.productId,
        variantSku: item.variantSku === '' ? null : item.variantSku,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
        stock,
        variant,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              price: item.product.price,
              stock: item.product.stock,
              images: item.product.images,
            }
          : null,
      }
    })

    return {
      cart: mapped,
      subtotal: Math.round(mapped.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100,
      totalItems: mapped.reduce((sum, i) => sum + i.quantity, 0),
    }
  }

  async addItem(userId: string, dto: CartItemDto) {
    const { productId, quantity, variantSku } = dto ?? {}
    if (!productId) throw new BadRequestException('productId is required')
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1) {
      throw new BadRequestException('Quantity must be a whole number >= 1')
    }

    const sku = variantSku?.trim() ?? ''

    // A variant product must name a variant; otherwise the line would hold the
    // derived product total instead of a specific SKU's stock.
    if (!sku) {
      const variantCount = await this.prisma.productVariant.count({
        where: { productId },
      })
      if (variantCount > 0) {
        throw new BadRequestException('This product has variants — choose one')
      }
    }

    const stock = await this.getStock(productId, sku || undefined)
    const cart = await this.getOrCreateCart(userId)

    const existing = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_variantSku: { cartId: cart.id, productId, variantSku: sku },
      },
    })

    const next = (existing?.quantity ?? 0) + qty
    if (next > stock) {
      const available = Math.max(stock - (existing?.quantity ?? 0), 0)
      throw new BadRequestException(
        available > 0
          ? `Only ${available} more available (stock: ${stock})`
          : `Only ${stock} available and your cart already has ${existing?.quantity ?? 0}`,
      )
    }

    const item = await this.prisma.cartItem.upsert({
      where: {
        cartId_productId_variantSku: { cartId: cart.id, productId, variantSku: sku },
      },
      update: { quantity: next },
      create: { cartId: cart.id, productId, variantSku: sku, quantity: next },
    })

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    })

    return { item, cart: (await this.getCart(userId)).cart }
  }

  async updateQuantity(
    userId: string,
    productId: string,
    quantity: number,
    variantSku?: string,
  ) {
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 0) {
      throw new BadRequestException('Quantity must be a whole number >= 0')
    }

    const sku = variantSku?.trim() ?? ''
    const cart = await this.getOrCreateCart(userId)
    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_variantSku: { cartId: cart.id, productId, variantSku: sku },
      },
    })
    if (!item) throw new NotFoundException('Item not in cart')

    const stock = await this.getStock(productId, sku || undefined)

    // quantity 0 (or a line that ran out of stock) removes the line item.
    if (qty === 0 || stock === 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } })
      return this.getCart(userId)
    }

    const next = Math.min(qty, stock)
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: next },
    })
    return this.getCart(userId)
  }

  async removeItem(userId: string, productId: string, variantSku?: string) {
    const sku = variantSku?.trim() ?? ''
    const cart = await this.getOrCreateCart(userId)
    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId_variantSku: { cartId: cart.id, productId, variantSku: sku },
      },
    })
    if (!item) throw new NotFoundException('Item not in cart')

    await this.prisma.cartItem.delete({ where: { id: item.id } })
    return this.getCart(userId)
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId)
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
    return this.getCart(userId)
  }
}
