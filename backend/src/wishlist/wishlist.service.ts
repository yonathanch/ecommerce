import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const WISHLIST_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          images: { select: { url: true, alt: true }, orderBy: { position: 'asc' } },
        },
      },
    },
  },
} as const

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wishlist rows are keyed by Wishlist.id (not User.id), so the wishlist row is
   * upserted before any item mutation.
   */
  private async getOrCreateWishlist(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new NotFoundException('User not found')

    return this.prisma.wishlist.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    })
  }

  async getWishlist(userId: string) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId },
      include: WISHLIST_INCLUDE,
    })
    if (!wishlist) return []
    return wishlist.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
    }))
  }

  async addItem(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    })
    if (!product) throw new NotFoundException('Product not found')

    const wishlist = await this.getOrCreateWishlist(userId)

    const exists = await this.prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    })
    if (exists) throw new ConflictException('Product already in wishlist')

    await this.prisma.wishlistItem.create({
      data: { wishlistId: wishlist.id, productId },
    })
    return this.getWishlist(userId)
  }

  async removeItem(userId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(userId)
    const item = await this.prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    })
    if (!item) throw new NotFoundException('Item not in wishlist')

    await this.prisma.wishlistItem.delete({ where: { id: item.id } })
    return this.getWishlist(userId)
  }

  async toggleItem(userId: string, productId: string) {
    const wishlist = await this.getOrCreateWishlist(userId)
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    })
    if (existing) {
      await this.prisma.wishlistItem.delete({ where: { id: existing.id } })
      return { added: false, items: await this.getWishlist(userId) }
    }
    await this.prisma.wishlistItem.create({
      data: { wishlistId: wishlist.id, productId },
    })
    return { added: true, items: await this.getWishlist(userId) }
  }
}
