import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { Request, Response } from 'express'

/**
 * Single place that turns any thrown error into a safe, consistent HTTP body.
 *
 * Contract:
 * - Known client errors (HttpException, Prisma constraint errors) keep their
 *   meaningful message so the UI can explain what to fix.
 * - Anything else becomes a generic 500 message: no stack traces, no SQL, no
 *   secrets leave the process. The details are logged server-side instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const { status, message } = this.describe(exception)

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const detail = exception instanceof Error ? exception.stack : String(exception)
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}: ${message}`,
        detail,
      )
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    })
  }

  private describe(exception: unknown): { status: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()

      if (typeof body === 'string') return { status, message: body }

      const payload = body as { message?: string | string[]; error?: string }
      return {
        status,
        message: payload.message ?? exception.message,
      }
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return { status: this.prismaStatus(exception), message: this.prismaMessage(exception) }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: HttpStatus.BAD_REQUEST, message: 'Invalid data supplied' }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    }
  }

  private prismaStatus(error: Prisma.PrismaClientKnownRequestError): number {
    switch (error.code) {
      case 'P2002':
        return HttpStatus.CONFLICT
      case 'P2025':
        return HttpStatus.NOT_FOUND
      case 'P2003':
        return HttpStatus.BAD_REQUEST
      default:
        return HttpStatus.BAD_REQUEST
    }
  }

  /** Constraint messages stay useful without echoing the failing SQL. */
  private prismaMessage(error: Prisma.PrismaClientKnownRequestError): string {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta as { target?: string[] })?.target
        return target?.length
          ? `A record with this ${target.join(', ')} already exists`
          : 'A record with these values already exists'
      }
      case 'P2003':
        return 'Related record does not exist'
      case 'P2025':
        return 'Record not found'
      default:
        return 'The request could not be processed'
    }
  }
}
