import { Module } from '@nestjs/common'
import { UploadsController } from './uploads.controller'

/**
 * File uploads for the admin back-office. Currently only product images
 * (POST /api/uploads/images); the files are served back by the static
 * middleware configured in main.ts.
 */
@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
