import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnalyzeModule } from './analyze/analyze.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DeviceThrottlerGuard } from './auth/device-throttler.guard';
import { AUTH_RATE_LIMIT_KEY } from './common/public.decorator';
import { HealthController } from './health/health.controller';
import { LlmModule } from './llm/llm.module';
import { MetricsModule } from './metrics/metrics.module';
import { SttModule } from './stt/stt.module';
import { readLimits } from './usage/limits';
import { UsageModule } from './usage/usage.module';

const isAuthRateLimited = (handler: object) =>
  Reflect.getMetadata(AUTH_RATE_LIMIT_KEY, handler) === true;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 테스트에서는 .env의 실제 API 키를 읽지 않는다.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const limits = readLimits(config);
        return [
          {
            name: 'default',
            ttl: 60_000,
            limit: limits.ratePerMinute || Number.MAX_SAFE_INTEGER,
            skipIf: (ctx) => isAuthRateLimited(ctx.getHandler()),
          },
          {
            name: 'auth',
            ttl: 60_000,
            limit: limits.authRatePerMinute || Number.MAX_SAFE_INTEGER,
            skipIf: (ctx) => !isAuthRateLimited(ctx.getHandler()),
          },
        ];
      },
    }),
    MetricsModule,
    UsageModule,
    LlmModule,
    AuthModule,
    AnalyzeModule,
    SttModule,
  ],
  controllers: [HealthController],
  providers: [
    // 순서가 중요하다. 인증이 먼저 기기 번호를 꺼내야 요청 제한이 기기 기준으로 센다.
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: DeviceThrottlerGuard },
  ],
})
export class AppModule {}
