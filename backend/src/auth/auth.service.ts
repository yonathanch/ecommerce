import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { User } from '@prisma/client'
import * as bcryptjs from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'

const ACCESS_TOKEN_TTL = '15m'
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const REFRESH_COOKIE = 'refresh_token'

export interface AuthPayload {
  id: string
  email: string
  name: string
  role: string
  accessToken: string
}

/** Internal return type: raw refresh token is only for the controller to set as cookie. */
export interface IssuedTokens extends AuthPayload {
  refreshToken: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private async issueTokens(user: User): Promise<IssuedTokens> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: ACCESS_TOKEN_TTL },
    )

    // Opaque refresh token; only its sha256 hash is persisted.
    const refreshToken = randomBytes(48).toString('hex')
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accessToken,
      refreshToken,
    }
  }

  async signup(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new BadRequestException('Email already registered')

    const hashedPassword = await bcryptjs.hash(password, 10)
    const user = await this.prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'CUSTOMER' },
    })

    return this.issueTokens(user)
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const isValid = await bcryptjs.compare(password, user.password)
    if (!isValid) throw new UnauthorizedException('Invalid credentials')

    return this.issueTokens(user)
  }

  /**
   * Rotate a refresh token: the presented token is revoked and a new one
   * issued. Re-using an already-revoked token is treated as theft and
   * revokes every session of that user.
   */
  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token')

    const tokenHash = this.hashToken(refreshToken)
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!stored) throw new UnauthorizedException('Invalid refresh token')

    if (stored.revokedAt) {
      // Token reuse — assume compromise, kill all sessions for this user.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw new UnauthorizedException('Refresh token reused; sessions revoked')
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired')
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    return this.issueTokens(stored.user)
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { success: true }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { success: true }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })
    if (!user) throw new UnauthorizedException('User not found')
    return user
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('User not found')
    return user
  }
}
