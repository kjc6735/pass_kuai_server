import { Module } from '@nestjs/common';
import { AnalyzeModule } from '../analyze/analyze.module';
import { VocabSentenceController } from './vocab-sentence.controller';
import { VocabSentenceService } from './vocab-sentence.service';
import { VocabWordController } from './vocab-word.controller';
import { VocabWordService } from './vocab-word.service';

@Module({
  imports: [AnalyzeModule],
  controllers: [VocabWordController, VocabSentenceController],
  providers: [VocabWordService, VocabSentenceService],
})
export class VocabModule {}
