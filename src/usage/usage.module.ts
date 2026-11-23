import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { DailyLimitInterceptor } from './daily-limit.interceptor';
import { UsageService } from './usage.service';

@Global()
@Module({
  providers: [
    {
      provide: UsageService,
      inject: [ConfigService],
      useFactory: (c: ConfigService<EnvConfig, true>) => new UsageService(c),
    },
    DailyLimitInterceptor,
  ],
  exports: [UsageService, DailyLimitInterceptor],
})
export class UsageModule {}
