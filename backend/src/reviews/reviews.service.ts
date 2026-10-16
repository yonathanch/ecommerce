import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrderStatus, Prisma, ReviewStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  NotificationsService,
} from '../notifications/notifications.service'
import { CreateReviewDto } from './dto/create-review.dto'

/**
 * Orders that actually moved money (REFUNDED excluded on purpose — same set the
 * dashboard counts as revenue). Only these unlock the right to review: a
 * cancelled or refunded purchase means the customer got their money back for
 * goods they returned, so their opinion no longer belongs on the product page.
 */
const PURCHASED: OrderStatus[] = ['PAID', 'SHIPPED', 'DELIVERED']

/** Newest first; the storefront never needs more than this on one page. */
const PUBLIC_PAGE_SIZE = 50

const REVIEW_SELECT = {
  id: true,
  productId: true,
  userId: true,
  orderId: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  reply: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReviewSelect

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>

/** 1.7 instead of 1.7000000000000002 — averages are floats, displays are not. */
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Product reviews: who may write one, what the storefront may show, and how the
 * back-office moderates them.
 *
 * Two invariants:
 * 1. Eligibility is a purchase that actually moved money (see PURCHASED), and
 *    one review per customer per product — enforced by the unique index as well
 *    as this check, so a double-submit cannot slip through.
 * 2. Only PUBLISHED rows are ever public. A pending review is visible to its
 *    author (so they know it exists and is waiting) and to the moderators, to
 *    nobody else. That keeps moderation meaningful instead of decorative.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------- public side

  private async requireProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    return product
  }

  /** Average and count of the reviews shoppers may actually see. */
  async ratingSummary(productId: string) {
    const aggregate = await this.prisma.review.aggregate({
      where: { productId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { _all: true },
    })
    return {
      average: aggregate._avg.rating === null ? 0 : round1(aggregate._avg.rating),
      count: aggregate._count._all,
    }
  }

  /**
   * Published reviews of a product with the rating summary the header renders.
   * Author names are public; emails never leave the back-office.
   */
  async listPublished(productId: string) {
    const product = await this.requireProduct(productId)

    const [rows, grouped] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId, status: 'PUBLISHED' },
        select: { ...REVIEW_SELECT, user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: PUBLIC_PAGE_SIZE,
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId, status: 'PUBLISHED' },
        _count: { _all: true },
      }),
    ])

    const distribution = Object.fromEntries(
      [1, 2, 3, 4, 5].map((star) => [
        star,
        grouped.find((g) => g.rating === star)?._count._all ?? 0,
      ]),
    )
    const count = grouped.reduce((sum, g) => sum + g._count._all, 0)
    const weighted = grouped.reduce((sum, g) => sum + g.rating * g._count._all, 0)

    return {
      product: { id: product.id, name: product.name },
      items: rows.map(({ user, ...review }) => ({
        ...review,
        author: user.name,
      })),
      summary: {
        count,
        average: count === 0 ? 0 : round1(weighted / count),
        distribution,
      },
    }
  }

  // --------------------------------------------------------------- buyer side

  /**
   * The most recent purchase that unlocks a review of this product, if any.
   * Newest first so `orderId` on the review points at the freshest receipt.
   */
  private async qualifyingOrder(userId: string, productId: string) {
    return this.prisma.order.findFirst({
      where: {
        userId,
        status: { in: PURCHASED },
        items: { some: { productId } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
  }

  private presentOwn(review: ReviewRow) {
    return {
      id: review.id,
      productId: review.productId,
      // The receipt that unlocked the review — the author's own order id.
      orderId: review.orderId,
      rating: review.rating,
      title: review.title,
      body: review.body,
      status: review.status,
      reply: review.reply,
      createdAt: review.createdAt,
    }
  }

  /**
   * What the product page needs to decide what to show a signed-in visitor:
   * the form, their own review (of any status), or a reason why neither.
   */
  async state(userId: string, productId: string) {
    await this.requireProduct(productId)

    const mine = await this.prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
      select: REVIEW_SELECT,
    })
    if (mine) {
      return { canReview: false, reason: 'ALREADY_REVIEWED', review: this.presentOwn(mine) }
    }

    const order = await this.qualifyingOrder(userId, productId)
    return {
      canReview: Boolean(order),
      reason: order ? null : 'NOT_PURCHASED',
      review: null,
    }
  }

  /**
   * Submit a review. It lands as PENDING: visible to the author and the
   * moderators, public only after an admin publishes it.
   */
  async create(userId: string, productId: string, dto: CreateReviewDto) {
    const product = await this.requireProduct(productId)

    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictException('You have already reviewed this product')
    }

    const order = await this.qualifyingOrder(userId, productId)
    if (!order) {
      throw new ForbiddenException(
        'Only customers who bought this product can review it',
      )
    }

    const review = await this.prisma.review.create({
      data: {
        productId,
        userId,
        // The receipt that unlocked the review — kept so eligibility can be
        // re-audited later without re-deriving it from the order list.
        orderId: order.id,
        rating: dto.rating,
        title: dto.title?.trim() || null,
        body: dto.body.trim(),
        status: 'PENDING',
      },
      select: REVIEW_SELECT,
    })

    // The moderation queue has a bell trail: admins learn a review is waiting
    // without polling the screen.
    await this.notifications.notifyAdmins({
      type: 'REVIEW_SUBMITTED',
      title: 'Ulasan baru menunggu moderasi',
      body: `Ulasan ${dto.rating}★ untuk "${product.name}" menunggu persetujuan.`,
      meta: { reviewId: review.id, productId, rating: dto.rating },
    })

    return this.presentOwn(review)
  }

  /** Every review this customer wrote, of any status, newest first. */
  async mine(userId: string) {
    const rows = await this.prisma.review.findMany({
      where: { userId },
      select: { ...REVIEW_SELECT, product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map(({ product, ...review }) => ({
      ...review,
      product: { id: product.id, name: product.name },
    }))
  }

  // ------------------------------------------------------------ admin side

  /** Rows for the moderation screen, newest first, with author and product. */
  async listForAdmin({
    status,
    search,
    page = 1,
    limit = 20,
  }: {
    status?: ReviewStatus
    search?: string
    page?: number
    limit?: number
  }) {
    const take = Math.min(limit, 100)
    const where: Prisma.ReviewWhereInput = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { body: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { reply: { contains: search, mode: 'insensitive' } },
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [rows, total, byStatus, published, publishedByRating] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: {
          ...REVIEW_SELECT,
          user: { select: { id: true, name: true, email: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * take,
        take,
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.review.aggregate({
        where: { status: 'PUBLISHED' },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { status: 'PUBLISHED' },
        _count: { _all: true },
      }),
    ])

    const counts = Object.fromEntries(
      byStatus.map((row) => [row.status, row._count._all]),
    )

    return {
      items: rows.map(({ user, product, ...review }) => ({
        ...review,
        author: { id: user.id, name: user.name, email: user.email },
        product: { id: product.id, name: product.name },
      })),
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
      summary: {
        total: total,
        pending: counts.PENDING ?? 0,
        published: counts.PUBLISHED ?? 0,
        rejected: counts.REJECTED ?? 0,
        // Averages describe what shoppers see right now, so a wave of pending
        // 5★ reviews cannot inflate the number the moderation screen reports.
        average: published._avg.rating === null ? 0 : round1(published._avg.rating),
        ratingCount: published._count._all,
        distribution: Object.fromEntries(
          [1, 2, 3, 4, 5].map((star) => [
            star,
            publishedByRating.find((g) => g.rating === star)?._count._all ?? 0,
          ]),
        ),
      },
    }
  }

  /**
   * Publish, reject, or reply to a review. `status` and `reply` are both
   * optional so the screen can approve without retyping the reply, and `reply:
   * null` clears a previous answer. Publishing or rejecting notifies the author
   * — silence would leave them refreshing the product page forever.
   */
  async moderate(
    id: string,
    dto: { status?: ReviewStatus; reply?: string | null },
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: {
        ...REVIEW_SELECT,
        user: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
    })
    if (!review) throw new NotFoundException('Review not found')
    if (dto.status === undefined && dto.reply === undefined) {
      throw new BadRequestException(
        'Nothing to update: send status and/or reply',
      )
    }

    const statusChanged = dto.status !== undefined && dto.status !== review.status
    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.reply === undefined
          ? {}
          : { reply: dto.reply?.trim() || null }),
      },
      select: REVIEW_SELECT,
    })

    if (statusChanged && dto.status !== 'PENDING') {
      const published = dto.status === 'PUBLISHED'
      await this.notifications.notify({
        userId: review.user.id,
        type: published ? 'REVIEW_PUBLISHED' : 'REVIEW_REJECTED',
        title: published ? 'Ulasan Anda tayang' : 'Ulasan Anda ditolak',
        body: published
          ? `Ulasan Anda untuk "${review.product.name}" sudah tayang di halaman produk.`
          : `Ulasan Anda untuk "${review.product.name}" tidak lolos moderasi.`,
        meta: { reviewId: id, productId: review.productId },
      })
    }

    return this.presentOwn(updated)
  }

  /** Remove a review outright — for spam or abusive content moderation. */
  async remove(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!review) throw new NotFoundException('Review not found')
    await this.prisma.review.delete({ where: { id } })
    return { id, deleted: true }
  }
}
