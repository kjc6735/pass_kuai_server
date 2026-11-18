import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DailyLimitGuard } from './daily-limit.guard';
import { UsageService } from './usage.service';

@Global()
@Module({
  providers: [
    {
      provide: UsageService,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => new UsageService(c),
    },
    DailyLimitGuard,
  ],
  exports: [UsageService, DailyLimitGuard],
})
export class UsageModule {}
