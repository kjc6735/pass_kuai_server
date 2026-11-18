import Anthropic from '@anthropic-ai/sdk';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';

@Module({
  controllers: [AnalyzeController],
  providers: [
    AnalyzeService,
    {
      provide: 'ANTHROPIC_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Anthropic({
          apiKey: configService.get<string>('ANTHROPIC_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class AnalyzeModule {}
