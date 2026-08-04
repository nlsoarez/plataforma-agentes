import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { assertSafeRuntimeDatabaseRole, carregarEnv } from '@plataforma/db';
import { allowedCorsOrigins, isOriginAllowed } from './security/cors';
import { validateApiRuntimeConfig } from '@plataforma/shared';

carregarEnv();

async function bootstrap() {
  validateApiRuntimeConfig();
  await assertSafeRuntimeDatabaseRole();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: false });
  const bodyLimit = process.env.HTTP_BODY_LIMIT ?? '25mb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  const allowed = allowedCorsOrigins();
  app.enableCors({
    credentials: true,
    origin(origin, cb) {
      if (isOriginAllowed(origin, allowed)) return cb(null, true);
      return cb(new Error(`CORS origin bloqueada: ${origin}`), false);
    },
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
