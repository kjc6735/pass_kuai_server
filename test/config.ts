import { ConfigService } from '@nestjs/config';
import { validateEnv, type EnvConfig } from '../src/config/env.schema';

export const testConfig = (env: Record<string, unknown> = {}) =>
  new ConfigService<EnvConfig, true>(validateEnv(env));
