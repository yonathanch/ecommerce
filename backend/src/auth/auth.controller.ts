import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService, REFRESH_COOKIE } from './auth.service'
import { SignupDto } from './dto/signup.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './jwt-auth.guard'

const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  })
}

function stripRefreshToken<T extends { refreshToken?: string }>(
  payload: T,
): Omit<T, 'refreshToken'> {
  const { refreshToken: _omitted, ...rest } = payload
  return rest
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() body: SignupDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.signup(body.email, body.password, body.name)
    setRefreshCookie(res, tokens.refreshToken)
    return stripRefreshToken(tokens)
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(body.email, body.password)
    setRefreshCookie(res, tokens.refreshToken)
    return stripRefreshToken(tokens)
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
    const tokens = await this.authService.refresh(token)
    setRefreshCookie(res, tokens.refreshToken)
    return stripRefreshToken(tokens)
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
    const result = await this.authService.logout(token)
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    return result
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: { id: string } }) {
    return this.authService.me(req.user.id)
  }
}
