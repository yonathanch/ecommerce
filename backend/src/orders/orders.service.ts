import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface CreateOrderDto {
  items: {
    productId: string
    quantity: number
  }[]
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must have at least one item')
    }

    // Verify products exist & check stock
    const productIds = dto.items.map((i) => i.productId)
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    })

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products not found')
    }

    let totalPrice = 0
    const orderItemsData: { productId: string; productName: string; price: number; quantity: number }[] = []

    for (const item of dto.items) {
      const product = products.find((p) => p.id === item.productId)!
      if (item.quantity < 1) {
        throw new BadRequestException(`Invalid quantity for ${product.name}`)
      }
      if (item.quantity > product.stock) {
        throw new BadRequestException(`Insufficient stock for ${product.name}. Available: ${product.stock}`)
      }
      const lineTotal = product.price * item.quantity
      totalPrice += lineTotal
      orderItemsData.push({
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: item.quantity,
      })
    }

    // Create order + deduct stock in transaction
    const order = await this.prisma.$transaction(async (tx) => {
      // Deduct stock for each product
      for (const item of dto.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })
      }

      // Create order with items
      return tx.order.create({
        data: {
          userId,
          totalPrice,
          status: 'PENDING',
          items: {
            create: orderItemsData,
          },
        },
        include: { items: true },
      })
    })

    return order
  }

  async findAll(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    })
    if (!order) throw new NotFoundException('Order not found')
    return order
  }

  async markAsPaid(userId: string, id: string) {
    const order = await this.findOne(userId, id)
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Only pending orders can be marked as paid')
    }
    return this.prisma.order.update({
      where: { id },
      data: { status: 'PAID' },
      include: { items: true },
    })
  }

  async cancel(userId: string, id: string) {
    const order = await this.findOne(userId, id)
    if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
      throw new BadRequestException('Cannot cancel shipped or delivered orders')
    }

    // Restore stock in transaction
    return this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        })
      }

      return tx.order.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { items: true },
      })
    })
  }
}
