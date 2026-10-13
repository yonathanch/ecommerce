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
   * If the product has variants, the chosen variant's SKU. Used only to
   * validate stock (cart rows are stored per product).
   */
  variantSku?: string
}

export interface CartSummary {
  cart: Array<{
    id: string
    productId: string
    quantity: number
    unitPrice: number
    lineTotal: number
    stock: number
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
   * Resolve a product's stock for a cart item.
   *
   * A product's SKUs are unique per purchasable combination, so callers may
   * send `variantSku` to validate against the variant instead of the
   * product-level stock.
   */
  async getStock(productId: string, variantSku?: string): Promise<number> {
    if (variantSku) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { sku: variantSku },
        select: { stock: true, productId: true },
      })
      if (!variant || variant.productId !== productId) {
        throw new NotFoundException('Variant not found for this product')
      }
      return variant.stock
    }

    // The cart must judge against *available* units (stock minus what unpaid
    // orders are holding), otherwise checkout would reject the item later.
    const { available } = await this.inventory.availability(productId)
    return available
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

    const mapped = items.map((item) => {
      const unitPrice = item.product?.price ?? 0
      const stock = item.product?.stock ?? 0
      return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
        stock,
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

    const stock = await this.getStock(productId, variantSku)
    const cart = await this.getOrCreateCart(userId)

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
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
      where: { cartId_productId: { cartId: cart.id, productId } },
      update: { quantity: next },
      create: { cartId: cart.id, productId, quantity: next },
    })

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    })

    return { item, cart: (await this.getCart(userId)).cart }
  }

  async updateQuantity(userId: string, productId: string, quantity: number) {
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 0) {
      throw new BadRequestException('Quantity must be a whole number >= 0')
    }

    const cart = await this.getOrCreateCart(userId)
    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    })
    if (!item) throw new NotFoundException('Item not in cart')

    const stock = await this.getStock(productId)

    // quantity 0 (or a product that ran out of stock) removes the line item.
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

  async removeItem(userId: string, productId: string) {
    const cart = await this.getOrCreateCart(userId)
    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
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
