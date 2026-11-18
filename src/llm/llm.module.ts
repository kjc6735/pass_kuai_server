import Anthropic from '@anthropic-ai/sdk';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { envNumber } from '../common/env-number';
import { ANTHROPIC_CLIENT, LlmService } from './llm.service';

@Global()
@Module({
  providers: [
    LlmService,
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Anthropic({
          apiKey: config.get<string>('ANTHROPIC_API_KEY'),
          // 비워 두면 실제 Claude, 실험에서는 가짜 서버 주소(lab/mock-llm)를 넣는다.
          baseURL: config.get<string>('ANTHROPIC_BASE_URL') || undefined,
          // SDK의 자동 재시도는 측정을 흐리게 하므로 횟수를 명시한다.
          maxRetries: envNumber(config, 'ANTHROPIC_MAX_RETRIES', 2),
          timeout: envNumber(config, 'ANTHROPIC_TIMEOUT_MS', 60_000),
        }),
    },
  ],
  exports: [LlmService],
})
export class LlmModule {}
