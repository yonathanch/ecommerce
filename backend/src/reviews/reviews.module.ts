import { Module } from '@nestjs/common'
import { ReviewsController } from './reviews.controller'
import { ReviewsService } from './reviews.service'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  // AdminModule imports this to expose the moderation endpoints.
  exports: [ReviewsService],
})
export class ReviewsModule {}
