import { join } from 'path'

/**
 * Where uploaded product images live on disk. Served read-only by Express at
 * /uploads/* — see main.ts. Single local directory keeps this deployable as
 * one process; a multi-instance deploy would swap this for object storage.
 */
export const UPLOAD_DIR = join(process.cwd(), 'uploads')

/**
 * URL prefix the static middleware mounts UPLOAD_DIR under (main.ts). Stored
 * product images are absolute URLs built from this prefix, so changing it
 * breaks already-saved galleries.
 */
export const UPLOAD_URL_PREFIX = '/uploads'

/**
 * Hard cap per image. Enforced by multer while the body streams in, so an
 * oversized upload is aborted instead of buffered fully into memory first.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
