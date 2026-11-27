import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { EnvConfig } from './config/env.schema';
import { Env, NodeEnv } from './constants/env';
import { setupApiDocs } from './docs/api-docs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule.forRoot(), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  if (config.get(Env.NODE_ENV, { infer: true }) !== NodeEnv.PRODUCTION) {
    setupApiDocs(app);
  }
  await app.listen(config.get(Env.PORT, { infer: true }));
}
void bootstrap();
