import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './common/config';

loadEnv();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true, rawBody: false });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/'] });
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[톡톡 Talk Talk] API listening on http://0.0.0.0:${port}/api/v1 (health: /health)`);
}

bootstrap();
