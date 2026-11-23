import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import type { EnvConfig } from './config/env.schema';
import { Env } from './constants/env';

export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
  const hops = config.get(Env.TRUST_PROXY, { infer: true });
  if (hops > 0) {
    (app as NestExpressApplication).set('trust proxy', hops);
  }
}
