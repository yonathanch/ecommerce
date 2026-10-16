import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
} from '@nestjs/throttler'

/**
 * Rate-limit guard that speaks the same error contract as every other route.
 *
 * The stock ThrottlerGuard throws a `ThrottlerException` whose message is the
 * developer-facing string "ThrottlerException: Too Many Requests". Swapping it
 * for a plain HttpException keeps the JSON envelope identical to the rest of
 * the API (`{ statusCode, error, message, path, timestamp }`) and gives the
 * shopper a sentence they can act on instead of a class name.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      'Too many requests — please slow down and try again shortly.',
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}
