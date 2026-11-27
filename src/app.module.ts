import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AgreementGuard } from './agreement/agreement.guard';
import { AgreementModule } from './agreement/agreement.module';
import { AnalyzeModule } from './analyze/analyze.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import type { RequestWithUser } from './common/request-with-user';
import { DatabaseModule } from './database/database.module';
import { THROTTLE_DEFAULT, THROTTLE_TTL_MS } from './constants/auth';
import { HealthController } from './health/health.controller';
import { LlmModule } from './llm/llm.module';
import { MetricsModule } from './metrics/metrics.module';
import { SttModule } from './stt/stt.module';
import { ReviewModule } from './review/review.module';
import { UsageModule } from './usage/usage.module';
import { VocabModule } from './vocab/vocab.module';
import { loggerParams } from './config/logger.config';
import { validateEnv, type EnvConfig } from './config/env.schema';
import { Env, NodeEnv } from './constants/env';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AgreementGuard },
  ],
})
export class AppModule {
  static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: process.env[Env.NODE_ENV] === NodeEnv.TEST,
          validate: validateEnv,
        }),
        LoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: loggerParams,
        }),
        ScheduleModule.forRoot(),
        ThrottlerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<EnvConfig, true>) => {
            const limit = config.get(Env.RATE_LIMIT_PER_MINUTE, {
              infer: true,
            });
            return {
              throttlers: [
                { name: THROTTLE_DEFAULT, ttl: THROTTLE_TTL_MS, limit },
              ],
              skipIf: () => limit === 0,
              getTracker: (req) => {
                const { userId, ip } = req as RequestWithUser;
                return userId ? `user:${userId}` : `ip:${ip}`;
              },
            };
          },
        }),
        DatabaseModule,
        MetricsModule,
        UsageModule,
        LlmModule,
        AgreementModule,
        AuthModule,
        AnalyzeModule,
        SttModule,
        VocabModule,
        ReviewModule,
      ],
    };
  }
}
