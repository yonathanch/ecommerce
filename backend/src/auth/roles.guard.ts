import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'

export const ROLES_KEY = 'roles'
/** Decorator: restrict a route to the given roles. e.g. @Roles(Role.ADMIN) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    // No @Roles() metadata → only authentication (handled by JwtAuthGuard) matters
    if (!required || required.length === 0) return true

    const { user } = context.switchToHttp().getRequest()
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }
    return true
  }
}
