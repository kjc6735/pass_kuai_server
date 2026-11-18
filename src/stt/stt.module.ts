import { Module } from '@nestjs/common';
import { OpenAiSttProvider } from './openai-stt.provider';
import { SttController } from './stt.controller';
import { SttProvider } from './stt.provider';
import { SttService } from './stt.service';

@Module({
  controllers: [SttController],
  providers: [
    SttService,
    { provide: SttProvider, useClass: OpenAiSttProvider },
  ],
})
export class SttModule {}
