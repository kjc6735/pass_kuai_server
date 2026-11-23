import Anthropic from '@anthropic-ai/sdk';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANTHROPIC_CLIENT } from '../constants/llm';
import { LlmService } from './llm.service';
import { Env } from '../constants/env';
import type { EnvConfig } from '../config/env.schema';

@Global()
@Module({
  providers: [
    LlmService,
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        new Anthropic({
          apiKey: config.get(Env.ANTHROPIC_API_KEY, { infer: true }),
          baseURL: config.get(Env.ANTHROPIC_BASE_URL, { infer: true }),
          maxRetries: config.get(Env.ANTHROPIC_MAX_RETRIES, { infer: true }),
          timeout: config.get(Env.ANTHROPIC_TIMEOUT_MS, { infer: true }),
        }),
    },
  ],
  exports: [LlmService],
})
export class LlmModule {}
