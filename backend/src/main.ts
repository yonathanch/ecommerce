import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Serve an OpenAPI 3 UI + JSON at `/api/docs`.
 *
 * The whole API is documented from its existing controllers and DTOs, so the
 * spec always matches the running code instead of drifting in a hand-written
 * file. The bearer scheme wires up the "Authorize" button so you can paste an
 * access token and try admin routes straight from the browser.
 *
 * Skipped in production unless SWAGGER_ENABLED=true — a public playground on a
 * live shop is an unnecessary attack surface.
 */
function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Ecommerce API')
    .setDescription(
      'REST API for the storefront and back-office. Routes marked with the bearer lock need an access token from POST /auth/login.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        name: 'Authorization',
        bearerFormat: 'JWT',
        scheme: 'bearer',
        type: 'http',
        description: 'Paste the accessToken returned by POST /api/auth/login',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // `api/docs` is registered verbatim (the global prefix does not apply to
  // Swagger's own route), so the UI lands alongside the API it documents.
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Ecommerce API Docs',
  });
}

async function bootstrap() {
  // rawBody keeps the untouched request body for HMAC webhook verification.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());

  // Security headers. We disable the CSP and COEP defaults because this is a
  // JSON API consumed by a separate Next.js app (different origin), not a
  // document server — the browser would otherwise block the cross-origin
  // fetches. CORP is relaxed to `cross-origin` for the same reason.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Validate and strip incoming request bodies globally.
  // whitelist: removes unknown properties; transform: coerces primitives to DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // API documentation (see setupSwagger). Off in production by default.
  const swaggerDisabledInProd =
    process.env.NODE_ENV === 'production' && process.env.SWAGGER_ENABLED !== 'true';
  if (!swaggerDisabledInProd) {
    setupSwagger(app);
  }

  // Parse PORT defensively: shell environments may export invalid values like "0".
  const parsedPort = Number(process.env.PORT);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3002;
  await app.listen(port);

  console.log(`🚀 Backend running on http://localhost:${port}/api`);
}

bootstrap();
