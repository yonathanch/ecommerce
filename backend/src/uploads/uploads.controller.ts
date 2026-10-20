import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Role } from '@prisma/client'
import { randomUUID } from 'crypto'
import { Request } from 'express'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles, RolesGuard } from '../auth/roles.guard'
import { MAX_IMAGE_BYTES, UPLOAD_DIR, UPLOAD_URL_PREFIX } from './uploads.constants'

/**
 * Decide the real format from the bytes instead of trusting the multipart
 * Content-Type header, which a tampered request can claim freely. Returns the
 * extension to store, or null when the bytes are not a supported image.
 */
function sniffImageExtension(buffer: Buffer): string | null {
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg'
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) return 'png'
  // GIF: "GIF87a" / "GIF89a"
  const head = buffer.subarray(0, 12)
  const gif = head.toString('ascii', 0, 6)
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif'
  // WebP: "RIFF" .... "WEBP"
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp'
  }
  return null
}

/**
 * Absolute base for stored image URLs. The product gallery keeps full URLs and
 * the storefront renders them from another origin, so a bare path would 404
 * there. PUBLIC_API_URL pins the base (useful behind a proxy); otherwise the
 * request's own origin is correct for local development.
 */
function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  return `${req.protocol}://${req.get('host') ?? 'localhost:3002'}`
}

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  /**
   * Store one product image and return the URL to put in `imageUrls`.
   *
   * Admin-only: the endpoint writes to the filesystem, and the storefront
   * itself never mints image URLs (products already carry them). Multer's
   * limits abort oversized bodies mid-stream, and the byte sniff below keeps
   * anything that is not a real image out of the upload directory.
   */
  @Post('images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
      // Cheap first gate on the declared type; the bytes are verified in the handler.
      fileFilter: (_req, file, callback) => {
        callback(null, typeof file?.mimetype === 'string' && file.mimetype.startsWith('image/'))
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a product image (admin). Field name: file' })
  async uploadImage(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: Request) {
    // fileFilter rejects non-image mimes silently, so "missing" and "not an
    // image" collapse into one actionable message.
    if (!file?.buffer?.length) {
      throw new BadRequestException('Pilih file gambar JPG, PNG, WebP, atau GIF.')
    }

    const extension = sniffImageExtension(file.buffer)
    if (!extension) {
      throw new BadRequestException('File bukan gambar yang didukung (JPG, PNG, WebP, atau GIF).')
    }

    // Never reuse the client's filename: it can contain paths or weird bytes.
    const filename = `${randomUUID()}.${extension}`
    await mkdir(UPLOAD_DIR, { recursive: true })
    // 'wx' fails loudly on a collision instead of overwriting another image.
    await writeFile(join(UPLOAD_DIR, filename), file.buffer, { flag: 'wx' })

    // UPLOAD_URL_PREFIX already starts with "/", so no separator is added here.
    return { url: `${publicBaseUrl(req)}${UPLOAD_URL_PREFIX}/${filename}` }
  }
}
