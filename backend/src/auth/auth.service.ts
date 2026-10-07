import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import * as bcryptjs from 'bcryptjs'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(email: string, password: string, name: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new BadRequestException('Email already registered')

    const hashedPassword = await bcryptjs.hash(password, 10)
    const user = await this.prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'CUSTOMER' },
    })

    const token = this.jwtService.sign({ sub: user.id, email: user.email })
    return { id: user.id, email: user.email, name: user.name, token }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) throw new UnauthorizedException('Invalid credentials')

    const isValid = await bcryptjs.compare(password, user.password)
    if (!isValid) throw new UnauthorizedException('Invalid credentials')

    const token = this.jwtService.sign({ sub: user.id, email: user.email })
    return { id: user.id, email: user.email, name: user.name, token }
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException('User not found')
    return user
  }
}
