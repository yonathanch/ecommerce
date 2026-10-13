import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { NotificationsService } from './notifications.service'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Request() req: { user: { id: string } },
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.list(req.user.id, {
      unreadOnly: unreadOnly === 'true',
    })
  }

  @Get('unread-count')
  unreadCount(@Request() req: { user: { id: string } }) {
    return this.notificationsService
      .unreadCount(req.user.id)
      .then((count) => ({ count }))
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.notificationsService.markRead(req.user.id, id)
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@Request() req: { user: { id: string } }) {
    return this.notificationsService.markAllRead(req.user.id)
  }
}
