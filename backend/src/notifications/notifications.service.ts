import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export type NotificationType =
  | 'ORDER_CREATED'
  | 'ORDER_PAID'
  | 'ORDER_CANCELLED'
  | 'ORDER_SHIPPED'
  | 'ORDER_DELIVERED'
  | 'ORDER_REFUNDED'
  | 'PAYMENT_FAILED'
  | 'RESERVATION_EXPIRED'
  | 'LOW_STOCK'

export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  meta?: Prisma.InputJsonValue
}

type Db = PrismaService | Prisma.TransactionClient

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * In-app feed only for now; email/push delivery is queued in M9. Accepting a
   * transaction client keeps notification writes inside the caller's atomic
   * unit of work (e.g. the payment capture transaction).
   */
  async notify(input: CreateNotificationInput, db: Db = this.prisma) {
    return db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        meta: input.meta,
      },
    })
  }

  async notifyAdmins(
    input: Omit<CreateNotificationInput, 'userId'>,
    db: Db = this.prisma,
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    })

    for (const admin of admins) {
      await this.notify({ ...input, userId: admin.id }, db)
    }

    return admins.length
  }

  async list(userId: string, { unreadOnly = false }: { unreadOnly?: boolean } = {}) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } })
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } })
    if (!notification) throw new NotFoundException('Notification not found')

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    })
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: result.count }
  }
}
